import { api } from "./client";
import type { ChallengeEntry, Post } from "../types";

export type ExploreKind = "posts" | "pieces";

export interface TrendingTag {
  tag: string;
  /** How many different people used it this week. */
  people: number;
  uses: number;
}

export const exploreApi = {
  /** The latest public posts or pieces, or those about one tag, twenty at a time (`before` is the cursor from the last page). */
  list: (options: { type: ExploreKind; tag?: string | null; before?: string | null; mine?: boolean }) => {
    const query = new URLSearchParams({ type: options.type });
    if (options.tag) query.set("tag", options.tag);
    if (options.before) query.set("before", options.before);
    if (options.mine && !options.tag) query.set("mine", "1");
    return api.get<{ type: ExploreKind; tag: string | null; posts?: Post[]; pieces?: ChallengeEntry[]; hasMore: boolean; next: string | null }>(`/explore?${query}`);
  },
  /** The topics used this week, most people first. */
  trending: () => api.get<{ tags: TrendingTag[]; days: number }>("/explore/trending"),
};
