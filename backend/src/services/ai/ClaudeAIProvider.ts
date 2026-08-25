import { AIService, ImageGenerationRequest, TextGenerationRequest } from "./AIService";

/**
 * Real provider stub. Wire this up once real API keys are available:
 * - generateText: call the Anthropic Messages API with process.env.ANTHROPIC_API_KEY
 * - generateImage: call a chosen image-gen API with process.env.IMAGE_GEN_API_KEY
 * Until implemented, set AI_PROVIDER=mock (default) so MockAIProvider is used instead.
 */
export class ClaudeAIProvider implements AIService {
  async generateText(_req: TextGenerationRequest): Promise<{ text: string }> {
    throw new Error("ClaudeAIProvider.generateText is not implemented yet");
  }

  async generateImage(_req: ImageGenerationRequest): Promise<{ url: string }> {
    throw new Error("ClaudeAIProvider.generateImage is not implemented yet");
  }
}
