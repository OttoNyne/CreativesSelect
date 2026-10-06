import type { ReactionKey, ReactionSummary } from "../types";

/** The six reactions, in the order they are offered. These match the server's fixed set. */
export const REACTIONS: { key: ReactionKey; emoji: string; name: string }[] = [
  { key: "like", emoji: "👍", name: "Like" },
  { key: "love", emoji: "❤️", name: "Love" },
  { key: "laugh", emoji: "😂", name: "Haha" },
  { key: "wow", emoji: "😮", name: "Wow" },
  { key: "sad", emoji: "😢", name: "Sad" },
  { key: "fire", emoji: "🔥", name: "Fire" },
];

export const emptyReactions = (): ReactionSummary => ({ counts: { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0 }, total: 0, mine: null });

/** The same summary as it would be if the viewer reacted this way (or, with null, took their reaction away). */
export function withMyReaction(summary: ReactionSummary, key: ReactionKey | null): ReactionSummary {
  const counts = { ...summary.counts };
  if (summary.mine) counts[summary.mine] = Math.max(0, counts[summary.mine] - 1);
  if (key) counts[key] += 1;
  return { counts, total: Object.values(counts).reduce((a, n) => a + n, 0), mine: key };
}
