import { api } from "./client";
import type { MediaItem } from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type UploadPurpose = "avatars" | "wallpapers" | "portfolio" | "tracks";

export async function uploadFile(
  file: File,
  purpose: UploadPurpose,
): Promise<{ url: string; mediaItem?: MediaItem }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/media/upload?purpose=${purpose}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new Error(data?.error ?? "Upload failed");
  }
  return data;
}

export interface CreateMediaItemInput {
  url: string;
  type?: "image" | "audio" | "video";
  caption?: string;
  isAiImage?: boolean;
}

export const mediaApi = {
  byUser: (username: string) => api.get<{ media: MediaItem[] }>(`/media/user/${username}`),
  create: (input: CreateMediaItemInput) => api.post<{ mediaItem: MediaItem }>("/media", input),
  remove: (id: string) => api.delete<void>(`/media/${id}`),
};
