import { describe, expect, it } from "vitest";
import { earliestStart, formatDay, formatWhen, untilText } from "./when";

const NOW = new Date("2026-10-10T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;

describe("formatDay", () => {
  it("writes a date out in full, and nothing for something that isn't a date", () => {
    expect(formatDay("2026-10-04T12:00:00.000Z", "en-US")).toBe("October 4, 2026");
    expect(formatDay(new Date("2026-01-09T12:00:00Z"), "en-US")).toBe("January 9, 2026");
    expect(formatDay("nope")).toBe("");
  });
});

describe("untilText", () => {
  it("says how long until a time, in a few words", () => {
    expect(untilText(at(10_000), NOW)).toBe("starting now");
    expect(untilText(at(-30_000), NOW)).toBe("starting now");
    expect(untilText(at(MIN), NOW)).toBe("in 1 minute");
    expect(untilText(at(25 * MIN), NOW)).toBe("in 25 minutes");
    expect(untilText(at(60 * MIN), NOW)).toBe("in 1 hour");
    expect(untilText(at(3 * 60 * MIN), NOW)).toBe("in 3 hours");
    expect(untilText(at(24 * 60 * MIN), NOW)).toBe("in 1 day");
    expect(untilText(at(5 * 24 * 60 * MIN), NOW)).toBe("in 5 days");
  });

  it("says started for a time that has passed, and nothing for a date that isn't one", () => {
    expect(untilText(at(-5 * MIN), NOW)).toBe("started");
    expect(untilText("not a date", NOW)).toBe("");
  });
});

describe("formatWhen", () => {
  it("shows the day and time", () => {
    const text = formatWhen("2026-10-10T19:00:00", "en-US");
    expect(text).toMatch(/Sat/);
    expect(text).toMatch(/Oct/);
    expect(text).toMatch(/7:00/);
  });

  it("accepts a Date, and gives nothing for rubbish", () => {
    expect(formatWhen(new Date("2026-10-10T19:00:00"), "en-US")).toMatch(/7:00/);
    expect(formatWhen("nope")).toBe("");
  });
});

describe("earliestStart", () => {
  it("is a datetime-local value a few minutes ahead, in local time", () => {
    const value = earliestStart(new Date(2026, 9, 10, 9, 30));
    expect(value).toBe("2026-10-10T09:36");
    expect(earliestStart(new Date(2026, 11, 31, 23, 58))).toBe("2027-01-01T00:04"); // rolls over midnight and the year
  });
});
