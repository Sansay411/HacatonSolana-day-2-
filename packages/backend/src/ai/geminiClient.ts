import { config } from "../config";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function buildGeminiUrl(apiKey: string, model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function extractText(response: GeminiGenerateContentResponse) {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || ""
  );
}

function isRetryableGeminiError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    /aborted/i.test(error.message) ||
    /timeout/i.test(error.message) ||
    /Gemini request failed \\(429\\)/i.test(error.message) ||
    /Gemini request failed \\(5\\d\\d\\)/i.test(error.message)
  );
}

async function requestGeminiOnce(params: {
  systemInstruction: string;
  userPrompt: string;
  schema: Record<string, unknown>;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const response = await fetch(buildGeminiUrl(config.ai.geminiApiKey, config.ai.model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: params.systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: params.userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          topP: 0.1,
          responseMimeType: "application/json",
          responseSchema: params.schema,
        },
      }),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status}): ${rawBody}`);
    }

    const parsedResponse = JSON.parse(rawBody) as GeminiGenerateContentResponse;
    const contentText = extractText(parsedResponse);
    if (!contentText) {
      throw new Error("Gemini returned an empty response");
    }

    return {
      rawBody,
      contentText,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateGeminiJson(params: {
  systemInstruction: string;
  userPrompt: string;
  schema: Record<string, unknown>;
}) {
  if (!config.ai.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  try {
    return await requestGeminiOnce(params);
  } catch (error) {
    if (!isRetryableGeminiError(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    return requestGeminiOnce(params);
  }
}
