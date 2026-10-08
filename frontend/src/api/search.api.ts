import { api } from "./client";
import type { Group, User } from "../types";
import { t } from "../i18n";

export type SearchType = "people" | "blog" | "groups" | "topics" | "help";
export type SearchConnection = "any" | "friends" | "mutual";

export const SEARCH_TYPES: { type: SearchType; label: string }[] = [
  { type: "people", get label() { return t("labels.people"); } },
  { type: "blog", get label() { return t("labels.blogEntries"); } },
  { type: "groups", get label() { return t("nav.groups"); } },
  { type: "topics", get label() { return t("labels.groupTopics"); } },
  { type: "help", get label() { return t("nav.helpWanted"); } },
];

export const isSearchType = (value: string | null): value is SearchType => SEARCH_TYPES.some((t) => t.type === value);

/** A person found: how many friends you share, and whether they are already your friend. */
export interface PersonResult extends User {
  mutualCount: number;
  isFriend: boolean;
}
export interface BlogResult {
  id: string;
  title: string;
  /** A few words from around where it matched. */
  snippet: string;
  createdAt: string;
  commentCount: number;
  author: User;
}
export interface GroupResult extends Group {
  snippet: string;
}
export interface TopicResult {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  snippet: string;
  replyCount: number;
  lastActivityAt: string;
  author: User | null;
}
export interface HelpResult {
  id: string;
  title: string;
  snippet: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  createdAt: string;
  author: User;
}

export interface SearchResults<T> {
  type: SearchType;
  /** The words that were looked for, lower case, for showing where they matched. */
  words: string[];
  results: T[];
  page: number;
  hasMore: boolean;
}

export interface SearchInput {
  q: string;
  type: SearchType;
  tag?: string;
  connection?: SearchConnection;
  /** Only people who say they are open to work. */
  open?: boolean;
  page?: number;
}

export const searchApi = {
  search: <T>({ q, type, tag, connection, open, page }: SearchInput) => {
    const query = new URLSearchParams({ q, type });
    if (tag) query.set("tag", tag);
    if (connection && connection !== "any") query.set("connection", connection);
    if (open) query.set("open", "1");
    if (page && page > 1) query.set("page", String(page));
    return api.get<SearchResults<T>>(`/search?${query.toString()}`);
  },
};
