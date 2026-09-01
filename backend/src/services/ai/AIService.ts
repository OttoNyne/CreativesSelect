export interface TextGenerationRequest {
  prompt: string;
  kind: "bio" | "caption" | "blurb";
}

export interface ImageGenerationRequest {
  prompt: string;
  kind: "avatar" | "wallpaper" | "post";
  /** Request an animated/looping result instead of a static image (wallpaper only). */
  live?: boolean;
}

export interface ImageSearchResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  creator?: string;
}

export interface AIService {
  generateText(req: TextGenerationRequest): Promise<{ text: string }>;
  generateImage(req: ImageGenerationRequest): Promise<{ url: string }>;
  /** Real (non-mocked) reverse-image-style keyword search over openly licensed photos. */
  searchImages(query: string): Promise<{ results: ImageSearchResult[] }>;
}
