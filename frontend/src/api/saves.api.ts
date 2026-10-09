import { api } from "./client";
import type { ChallengeEntry, Post } from "../types";

export type SaveKind = "posts" | "pieces";

export const savesApi = {
  /** Save a post or a portfolio piece to your private list. */
  save: (kind: SaveKind, id: string) => api.put<{ saved: true }>(`/saves/${kind}/${encodeURIComponent(id)}`),
  /** Take it out of the list. */
  unsave: (kind: SaveKind, id: string) => api.delete<void>(`/saves/${kind}/${encodeURIComponent(id)}`),
  /** Your saved posts or pieces, most recently saved first, twenty at a time (`before` is the cursor from the last page). */
  list: (type: SaveKind, before?: string | null) => api.get<{ type: SaveKind; posts?: Post[]; pieces?: ChallengeEntry[]; hasMore: boolean; next: string | null }>(`/saves?type=${type}${before ? `&before=${encodeURIComponent(before)}` : ""}`),
};
