import { api } from "./client";
import type { Track } from "../types";

export interface CreateTrackInput {
  title: string;
  sourceType: "upload" | "youtube";
  url: string;
}

export const tracksApi = {
  byUser: (username: string) => api.get<{ tracks: Track[] }>(`/profiles/${username}/tracks`),
  add: (input: CreateTrackInput) => api.post<{ track: Track }>("/tracks", input),
  remove: (id: string) => api.delete<void>(`/tracks/${id}`),
};
