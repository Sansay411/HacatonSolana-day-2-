import { config } from "../config";
import { GeminiProvider } from "./gemini";
import { AIProvider } from "./provider";

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (provider) return provider;

  switch (config.ai.provider) {
    case "gemini":
      provider = new GeminiProvider();
      return provider;
    default:
      throw new Error(`Unsupported AI provider: ${config.ai.provider}`);
  }
}

export * from "./provider";

