import { describe, expect, it } from "vitest";
import { isValidTag, normalizeTag, tagProblem, MAX_TAGS } from "./tags";

describe("normalizeTag", () => {
  it("lower-cases, drops leading #, and tidies spaces and hyphens", () => {
    expect(normalizeTag("  #Lo-Fi   Producer ")).toBe("lo-fi producer");
    expect(normalizeTag("##Illustrator")).toBe("illustrator");
    expect(normalizeTag("lo - fi")).toBe("lo-fi");
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("isValidTag", () => {
  it("accepts 2–24 letters, numbers, spaces and hyphens, starting with a letter or number", () => {
    expect(isValidTag("dj")).toBe(true);
    expect(isValidTag("lo-fi producer")).toBe(true);
    expect(isValidTag("café")).toBe(true);
    expect(isValidTag("3d artist")).toBe(true);
  });
  it("rejects too short, too long, odd characters, or a bad start", () => {
    expect(isValidTag("a")).toBe(false);
    expect(isValidTag("a".repeat(25))).toBe(false);
    expect(isValidTag("<script>")).toBe(false);
    expect(isValidTag("-dash")).toBe(false);
    expect(isValidTag("rock&roll")).toBe(false);
  });
});

describe("tagProblem", () => {
  it("says nothing for an empty draft or a good tag", () => {
    expect(tagProblem("", [])).toBeNull();
    expect(tagProblem("  ", [])).toBeNull();
    expect(tagProblem("potter", [])).toBeNull();
  });
  it("explains a tag that can't be added", () => {
    expect(tagProblem("x", [])).toMatch(/Use 2–24/);
    expect(tagProblem("#Potter", ["potter"])).toMatch(/already have "potter"/);
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `tag${i}`);
    expect(tagProblem("another", full)).toMatch(/up to 8/);
  });
});
