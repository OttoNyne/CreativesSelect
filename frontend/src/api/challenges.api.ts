import { api } from "./client";
import type { ChallengeEntry, ChallengeWeek, MediaItem } from "../types";
import type { Language } from "../i18n";

export const GALLERY_PAGE = 24;
export type GallerySort = "new" | "top";

export const challengesApi = {
  /** This week's prompt, last week's, how many have entered, and (signed in) your own entry. */
  current: (lang: Language) => api.get<{ week: ChallengeWeek; previous: ChallengeWeek; entryCount: number; mine: { id: string; item: MediaItem } | null }>(`/challenges/current?lang=${lang}`),
  /** A week's entries, newest first or (`top`) most reactions first, a page at a time (or `limit` for a short list). */
  entries: (week: string, options: { lang: Language; sort?: GallerySort; page?: number; limit?: number }) => {
    const query = new URLSearchParams({ lang: options.lang });
    if (options.sort === "top") query.set("sort", "top");
    if (options.page && options.page > 1) query.set("page", String(options.page));
    if (options.limit) query.set("limit", String(options.limit));
    return api.get<{ week: ChallengeWeek; entries: ChallengeEntry[]; total: number; hasMore: boolean }>(`/challenges/${encodeURIComponent(week)}/entries?${query}`);
  },
  /** Enter one of your pieces in this week's challenge. */
  enter: (itemId: string) => api.post<{ entry: { id: string; item: MediaItem } }>("/challenges/current/entry", { itemId }),
  /** Take your entry out of this week's challenge. */
  withdraw: () => api.delete<void>("/challenges/current/entry"),
};
