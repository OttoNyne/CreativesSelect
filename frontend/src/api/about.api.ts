import { api } from "./client";
import type { ProfileAbout } from "../types";
import { t } from "../i18n";

export const ABOUT_FIELDS = ["interests", "music", "movies", "books", "meet"] as const;
export type AboutField = (typeof ABOUT_FIELDS)[number];
export const ABOUT_LABELS: Record<AboutField, string> = {
  get interests() { return t("about.interests"); },
  get music() { return t("about.favouriteMusic"); },
  get movies() { return t("about.favouriteFilmsAndShows"); },
  get books() { return t("about.favouriteBooks"); },
  get meet() { return t("about.whoIdLikeTo"); },
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
