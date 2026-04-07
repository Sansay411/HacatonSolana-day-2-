import type { AIBehaviorFlag } from "../ai/provider";
import type { WalletRequestActivityRecord } from "../db/queries";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  operations: [
    "operations",
    "ops",
    "expense",
    "vendor",
    "service",
    "invoice",
    "subscription",
    "операци",
    "расход",
    "сервис",
    "услуг",
    "подписк",
    "счет",
    "оплат",
    "налог",
  ],
  infra: [
    "infra",
    "server",
    "hosting",
    "cloud",
    "node",
    "rpc",
    "database",
    "storage",
    "инфра",
    "сервер",
    "хостинг",
    "облак",
    "нод",
    "база дан",
    "хранилищ",
    "музыкальн",
    "сервис",
  ],
  payroll: [
    "salary",
    "payroll",
    "team",
    "contractor",
    "developer",
    "designer",
    "зарплат",
    "команд",
    "подрядчик",
    "разработчик",
    "дизайнер",
  ],
  growth: [
    "growth",
    "sales",
    "ads",
    "campaign",
    "distribution",
    "рост",
    "продаж",
    "реклам",
    "кампан",
    "продвиж",
  ],
  grants: [
    "grant",
    "grant program",
    "grant round",
    "scholarship",
    "грант",
    "грантов",
    "стипенди",
  ],
  marketing: [
    "marketing",
    "brand",
    "content",
    "promotion",
    "community campaign",
    "маркетинг",
    "бренд",
    "контент",
    "промо",
    "продвиж",
  ],
  research: [
    "research",
    "audit",
    "analysis",
    "investigation",
    "testing",
    "исслед",
    "аудит",
    "анализ",
    "тест",
    "провер",
  ],
  community: [
    "community",
    "events",
    "moderation",
    "ambassador",
    "education",
    "сообществ",
    "событи",
    "модерац",
    "амбассад",
    "обучен",
  ],
};

export interface BehavioralContextInput {
  description: string;
  history: WalletRequestActivityRecord[];
  allowedCategories: string[];
  now: number;
}

export interface BehavioralContextResult {
  flags: AIBehaviorFlag[];
  requestFrequency: number;
  timeSinceLastRequest: number | null;
  rejectCount: number;
  categoryMismatch: boolean;
  categoryMatch: string | null;
}

function dedupeFlags(flags: AIBehaviorFlag[]) {
  return Array.from(new Set(flags));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectCategoryMatch(description: string, allowedCategories: string[]) {
  const normalizedDescription = normalizeText(description);

  for (const category of allowedCategories) {
    const keywords = CATEGORY_KEYWORDS[category] || [category];
    if (keywords.some((keyword) => normalizedDescription.includes(keyword))) {
      return category;
    }
  }

  return null;
}

export function buildBehavioralContext(input: BehavioralContextInput): BehavioralContextResult {
  const lastRequest = input.history[0] || null;
  const timeSinceLastRequest = lastRequest ? Math.max(0, input.now - lastRequest.createdAt) : null;
  const requestsInWindow = input.history.filter((item) => input.now - item.createdAt <= 10 * 60);
  const rejectCount = input.history.filter((item) => item.decision === "rejected").length;
  const categoryMatch = detectCategoryMatch(input.description, input.allowedCategories);
  const categoryMismatch = false;

  const flags: AIBehaviorFlag[] = [];

  if (timeSinceLastRequest !== null && timeSinceLastRequest < 2 * 60) {
    flags.push("high_frequency");
  }

  if (lastRequest?.decision === "rejected") {
    flags.push("repeat_after_reject");
  }

  if (requestsInWindow.length >= 3 || rejectCount >= 2) {
    flags.push("suspicious_pattern");
  }

  return {
    flags: dedupeFlags(flags),
    requestFrequency: requestsInWindow.length,
    timeSinceLastRequest,
    rejectCount,
    categoryMismatch,
    categoryMatch,
  };
}

export function computeBehavioralPenalty(flags: AIBehaviorFlag[]) {
  let penalty = 0;

  if (flags.includes("repeat_after_reject")) penalty += 10;
  if (flags.includes("high_frequency")) penalty += 5;
  if (flags.includes("category_mismatch")) penalty += 10;
  if (flags.includes("suspicious_pattern")) penalty += 15;

  return penalty;
}

export function explainBehavioralFlags(flags: AIBehaviorFlag[]) {
  const explanations: string[] = [];

  if (flags.includes("repeat_after_reject")) {
    explanations.push("Repeated request attempts after rejection were detected.");
  }

  if (flags.includes("high_frequency")) {
    explanations.push("Requests are arriving in a high-frequency pattern.");
  }

  if (flags.includes("category_mismatch")) {
    explanations.push("The request description does not align with the allowed vault categories.");
  }

  if (flags.includes("suspicious_pattern")) {
    explanations.push("The wallet shows a suspicious request pattern in the recent window.");
  }

  return explanations;
}
