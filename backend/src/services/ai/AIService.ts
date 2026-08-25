export interface TextGenerationRequest {
  prompt: string;
  kind: "bio" | "caption" | "blurb";
}

export interface ImageGenerationRequest {
  prompt: string;
  kind: "avatar" | "banner" | "wallpaper" | "post";
}

export interface AIService {
  generateText(req: TextGenerationRequest): Promise<{ text: string }>;
  generateImage(req: ImageGenerationRequest): Promise<{ url: string }>;
}
