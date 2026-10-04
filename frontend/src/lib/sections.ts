import type { User } from "../types";

// The parts of a profile below the introduction. The owner can put them in any order and hide any of them; the server
// keeps the same list (utils/profileSections.js).
export const SECTION_KEYS = ["friends", "music", "portfolio", "blog", "testimonials"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  friends: "Top friends",
  music: "Music",
  portfolio: "Portfolio",
  blog: "Blog",
  testimonials: "Testimonials",
};

const known = (key: unknown): key is SectionKey => SECTION_KEYS.includes(key as SectionKey);

/** Every section once, in the owner's order; any the saved list doesn't mention follow in the usual order. */
export function orderOf(profile: Pick<User, "sectionOrder">): SectionKey[] {
  const order: SectionKey[] = [];
  for (const key of profile.sectionOrder ?? []) if (known(key) && !order.includes(key)) order.push(key);
  return [...order, ...SECTION_KEYS.filter((key) => !order.includes(key))];
}

export const hiddenOf = (profile: Pick<User, "hiddenSections">): SectionKey[] => [...new Set((profile.hiddenSections ?? []).filter(known))];

/** The order after moving one section a place up (-1) or down (1); unchanged at either end. */
export function moveSection(order: SectionKey[], key: SectionKey, direction: -1 | 1): SectionKey[] {
  const from = order.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
