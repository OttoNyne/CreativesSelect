import { describe, expect, it } from "vitest";
import { LIMITS, SUBJECTS, TWISTS, decodeSpark, encodeSpark, partText, randomSpark, rerollPart, sparkOfDay, sparkText } from "./sparks";

describe("the spark dice", () => {
  it("has words for every number of every die, so no spark can show a missing-text key", () => {
    for (const [part, count] of [["subject", SUBJECTS], ["twist", TWISTS], ["limit", LIMITS]] as const) {
      for (let n = 1; n <= count; n++) expect(partText(part, n), `${part} ${n}`).not.toMatch(/^play\./);
    }
  });

  it("gives everyone the same spark on the same day, and a different one on other days", () => {
    const noon = new Date("2026-10-19T12:00:00Z");
    const evening = new Date("2026-10-19T23:59:00Z");
    expect(sparkOfDay(noon)).toEqual(sparkOfDay(evening));
    const seen = new Set<string>();
    for (let day = 0; day < 30; day++) seen.add(encodeSpark(sparkOfDay(new Date(Date.UTC(2026, 9, 1 + day, 9)))));
    expect(seen.size).toBeGreaterThan(20);
  });

  it("only ever makes sparks whose numbers are in range", () => {
    for (let i = 0; i < 200; i++) {
      const spark = i % 2 ? randomSpark() : sparkOfDay(new Date(Date.UTC(2026, 0, 1 + i)));
      expect(spark.subject).toBeGreaterThanOrEqual(1);
      expect(spark.subject).toBeLessThanOrEqual(SUBJECTS);
      expect(spark.twist).toBeGreaterThanOrEqual(1);
      expect(spark.twist).toBeLessThanOrEqual(TWISTS);
      expect(spark.limit).toBeGreaterThanOrEqual(1);
      expect(spark.limit).toBeLessThanOrEqual(LIMITS);
    }
  });

  it("rolls one die again and always lands on something new, leaving the others alone", () => {
    const start = { subject: 3, twist: 12, limit: 1 };
    for (const rand of [() => 0, () => 0.5, () => 0.999999]) {
      for (const part of ["subject", "twist", "limit"] as const) {
        const next = rerollPart(start, part, rand);
        expect(next[part]).not.toBe(start[part]);
        expect(next[part]).toBeGreaterThanOrEqual(1);
        for (const other of (["subject", "twist", "limit"] as const).filter((p) => p !== part)) expect(next[other]).toBe(start[other]);
      }
    }
    // the first and last numbers wrap round instead of falling off the list
    expect(rerollPart({ subject: SUBJECTS, twist: 1, limit: 1 }, "subject", () => 0).subject).toBe(1);
  });

  it("travels in a link as three numbers, and anything else in a link is ignored", () => {
    const spark = { subject: 16, twist: 12, limit: 10 };
    expect(decodeSpark(encodeSpark(spark))).toEqual(spark);
    for (const bad of [null, undefined, "", "1-2", "1-2-3-4", "0-1-1", "17-1-1", "1-13-1", "1-1-11", "a-b-c", "1-2-3<script>", "-1-2-3"]) expect(decodeSpark(bad)).toBeNull();
  });

  it("reads as one sentence with the subject, the twist and the rule in it", () => {
    expect(sparkText({ subject: 1, twist: 1, limit: 1 })).toBe("A lighthouse, upside down. Only three colors.");
  });
});
