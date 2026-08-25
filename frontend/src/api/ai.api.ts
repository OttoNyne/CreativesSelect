import { api } from "./client";

export const aiApi = {
  generateText: (prompt: string, kind: "bio" | "caption" | "blurb") =>
    api.post<{ text: string }>("/ai/text", { prompt, kind }),
  generateImage: (prompt: string, kind: "avatar" | "banner" | "post") =>
    api.post<{ url: string }>("/ai/image", { prompt, kind }),
};
