import { describe, expect, it } from "vitest";
import { REACTIONS, emptyReactions, withMyReaction } from "./reactions";

describe("reactions", () => {
  it("are the six, in the order they are offered, each with a name and a mark", () => {
    expect(REACTIONS.map((r) => r.key)).toEqual(["like", "love", "laugh", "wow", "sad", "fire"]);
    expect(REACTIONS.map((r) => r.emoji)).toEqual(["👍", "❤️", "😂", "😮", "😢", "🔥"]);
    expect(REACTIONS.map((r) => r.name)).toEqual(["Like", "Love", "Haha", "Wow", "Sad", "Fire"]);
  });

  it("start empty, and each empty one is its own", () => {
    const a = emptyReactions();
    a.counts.like = 3;
    expect(emptyReactions()).toEqual({ counts: { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0 }, total: 0, mine: null });
  });

  it("work out what a reaction would add up to: adding, switching and taking away", () => {
    const base = { counts: { like: 2, love: 0, laugh: 0, wow: 0, sad: 0, fire: 1 }, total: 3, mine: null } as const;
    const added = withMyReaction(base, "love");
    expect(added).toEqual({ counts: { like: 2, love: 1, laugh: 0, wow: 0, sad: 0, fire: 1 }, total: 4, mine: "love" });
    const switched = withMyReaction(added, "fire");
    expect(switched).toEqual({ counts: { like: 2, love: 0, laugh: 0, wow: 0, sad: 0, fire: 2 }, total: 4, mine: "fire" });
    const away = withMyReaction(switched, null);
    expect(away).toEqual({ counts: { like: 2, love: 0, laugh: 0, wow: 0, sad: 0, fire: 1 }, total: 3, mine: null });
    expect(base.counts.love).toBe(0); // the one it started from is left alone
  });

  it("never goes below none", () => {
    expect(withMyReaction({ counts: { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0 }, total: 0, mine: "like" }, null).counts.like).toBe(0);
  });
});
