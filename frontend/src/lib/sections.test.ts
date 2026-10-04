import { describe, expect, it } from "vitest";
import { SECTION_KEYS, hiddenOf, moveSection, orderOf, type SectionKey } from "./sections";

describe("orderOf", () => {
  it("is the usual order when nothing is saved", () => {
    expect(orderOf({})).toEqual([...SECTION_KEYS]);
    expect(orderOf({ sectionOrder: [] })).toEqual([...SECTION_KEYS]);
  });
  it("follows the saved order, with every section once", () => {
    expect(orderOf({ sectionOrder: ["blog", "music"] })).toEqual(["blog", "music", "friends", "portfolio", "testimonials"]);
    expect(orderOf({ sectionOrder: ["music", "nope", "music", "friends"] as SectionKey[] })).toEqual(["music", "friends", "portfolio", "blog", "testimonials"]);
  });
});

describe("hiddenOf", () => {
  it("lists the hidden sections that exist, once each", () => {
    expect(hiddenOf({})).toEqual([]);
    expect(hiddenOf({ hiddenSections: ["blog", "blog", "nope"] as SectionKey[] })).toEqual(["blog"]);
  });
});

describe("moveSection", () => {
  const order: SectionKey[] = ["friends", "music", "portfolio", "blog", "testimonials"];
  it("moves a section up or down a place", () => {
    expect(moveSection(order, "music", -1)).toEqual(["music", "friends", "portfolio", "blog", "testimonials"]);
    expect(moveSection(order, "music", 1)).toEqual(["friends", "portfolio", "music", "blog", "testimonials"]);
  });
  it("leaves the order alone at either end, and doesn't change the list it was given", () => {
    expect(moveSection(order, "friends", -1)).toEqual(order);
    expect(moveSection(order, "testimonials", 1)).toEqual(order);
    const copy = [...order];
    moveSection(order, "blog", -1);
    expect(order).toEqual(copy);
  });
});
