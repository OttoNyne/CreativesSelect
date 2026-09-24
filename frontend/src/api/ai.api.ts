import { api } from "./client";
import type { ImageSearchResult } from "../types";

export const aiApi = {
  generateText: (prompt: string, kind: "bio" | "caption" | "blurb") =>
    api.post<{ text: string }>("/ai/text", { prompt, kind }),
  generateImage: (prompt: string, kind: "avatar" | "wallpaper" | "post") =>
    api.post<{ url: string }>("/ai/image", { prompt, kind }),
  searchImages: (query: string) =>
    api.get<{ results: ImageSearchResult[] }>(`/ai/images/search?q=${encodeURIComponent(query)}`),
};
