import { api, ApiError } from "./client";
import { API_BASE } from "./base";
import type { ImageSearchResult } from "../types";

/** How closely a wallpaper made from a reference photo follows that photo. */
export type WallpaperCloseness = "close" | "balanced" | "loose";

export const aiApi = {
  generateText: (prompt: string, kind: "bio" | "caption" | "blurb") =>
    api.post<{ text: string }>("/ai/text", { prompt, kind }),
  generateImage: (prompt: string, kind: "avatar" | "wallpaper" | "post") =>
    api.post<{ url: string }>("/ai/image", { prompt, kind }),
  /** A wallpaper picture from a description, optionally reshaping a reference photo (sent with the request, not as a link). */
  generateWallpaper: async (input: { prompt: string; reference?: Blob; closeness?: WallpaperCloseness }) => {
    const form = new FormData();
    form.append("prompt", input.prompt);
    if (input.closeness) form.append("closeness", input.closeness);
    if (input.reference) form.append("reference", input.reference, "reference.jpg");
    // not the JSON client: a form carries the photo, and the browser sets its content type
    const res = await fetch(`${API_BASE}/api/ai/wallpaper`, { method: "POST", credentials: "include", body: form });
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? "Couldn't make a wallpaper, try again.");
    return data as { url: string; usedReference: boolean };
  },
  /** Throw away a generated picture that wasn't used (best effort; never throws). */
  discard: (url: string) => api.post<void>("/ai/discard", { url }).catch(() => undefined),
  searchImages: (query: string) =>
    api.get<{ results: ImageSearchResult[] }>(`/ai/images/search?q=${encodeURIComponent(query)}`),
};
