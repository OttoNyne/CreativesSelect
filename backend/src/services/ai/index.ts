import { env } from "../../config/env";
import { AIService } from "./AIService";
import { MockAIProvider } from "./MockAIProvider";
import { ClaudeAIProvider } from "./ClaudeAIProvider";

let instance: AIService | null = null;

export function getAIService(): AIService {
  if (!instance) {
    instance = env.aiProvider === "real" ? new ClaudeAIProvider() : new MockAIProvider();
  }
  return instance;
}
