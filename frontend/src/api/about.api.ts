import { api } from "./client";
import type { ProfileAbout } from "../types";

export const ABOUT_FIELDS = ["interests", "music", "movies", "books", "meet"] as const;
export type AboutField = (typeof ABOUT_FIELDS)[number];
export const ABOUT_LABELS: Record<AboutField, string> = {
  interests: "Interests",
  music: "Favourite music",
  movies: "Favourite films and shows",
  books: "Favourite books",
  meet: "Who I'd like to meet",
};
export const MAX_ABOUT = 300;
export const MAX_LOCATION = 60;

/** What the owner can change; send only what changed. `birthday: null` stops sharing it. */
export interface AboutInput extends Partial<Record<AboutField, string>> {
  location?: string;
  locationAudience?: "friends" | "everyone";
  birthday?: { month: number; day: number } | null;
}

export const aboutApi = {
  /** Someone's About me, as much of it as you may see. */
  get: (username: string) => api.get<ProfileAbout>(`/about/${encodeURIComponent(username)}`),
  save: (input: AboutInput) => api.put<ProfileAbout>("/about/me", input),
};
