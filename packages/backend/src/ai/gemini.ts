import { AIProvider, AIProviderResult, AIRequestInput } from "./provider";
import { evaluateRequestWithGemini } from "./evaluateRequest";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  async evaluate(input: AIRequestInput): Promise<AIProviderResult> {
    return evaluateRequestWithGemini(input);
  }
}
