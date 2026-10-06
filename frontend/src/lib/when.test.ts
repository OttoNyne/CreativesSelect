import { describe, expect, it } from "vitest";
import { agoText, daysLeft, earliestStart, formatCalendarDay, formatDay, formatWhen, toLocalInput, untilText } from "./when";

const NOW = new Date("2026-10-10T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;

describe("agoText", () => {
  it("says how long ago in a few words", () => {
    expect(agoText(at(-5_000), NOW)).toBe("just now");
    expect(agoText(at(-59_000), NOW)).toBe("just now");
    expect(agoText(at(-MIN), NOW)).toBe("1 minute ago");
    expect(agoText(at(-12 * MIN), NOW)).toBe("12 minutes ago");
    expect(agoText(at(-60 * MIN), NOW)).toBe("1 hour ago");
    expect(agoText(at(-5 * 60 * MIN), NOW)).toBe("5 hours ago");
    expect(agoText(at(-24 * 60 * MIN), NOW)).toBe("1 day ago");
    expect(agoText(at(-3 * 24 * 60 * MIN), NOW)).toBe("3 days ago");
  });

  it("doesn't mind a clock that is a little ahead, and says nothing for nonsense", () => {
    expect(agoText(at(30_000), NOW)).toBe("just now");
    expect(agoText("not a date", NOW)).toBe("");
  });
});

describe("formatCalendarDay", () => {
  it("writes a UTC calendar day out in full, whatever the viewer's time zone", () => {
    expect(formatCalendarDay("2026-10-04", "en-US")).toBe("October 4, 2026");
    expect(formatCalendarDay("2026-01-01", "en-US")).toBe("January 1, 2026");
  });
  it("says nothing for something that isn't a day", () => {
    for (const bad of ["", "nope", "2026-13-45x", "2026-10-4", "2026-10-04T12:00:00Z"]) expect(formatCalendarDay(bad)).toBe("");
  });
});

describe("daysLeft", () => {
  it("counts days to the nearest, and says less than a day near the end", () => {
    expect(daysLeft(at(10 * 24 * 60 * MIN - 1000), NOW)).toBe("10 days left");
    expect(daysLeft(at(2 * 24 * 60 * MIN + 1000), NOW)).toBe("2 days left");
    expect(daysLeft(at(24 * 60 * MIN + 1000), NOW)).toBe("1 day left");
    expect(daysLeft(at(23 * 60 * MIN), NOW)).toBe("less than a day left");
    expect(daysLeft(at(-MIN), NOW)).toBe("less than a day left");
    expect(daysLeft("nope", NOW)).toBe("");
  });
});

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

describe("toLocalInput", () => {
  it("writes a time the way a datetime-local box wants it, in the viewer's own time zone", () => {
    const d = new Date(2030, 4, 4, 9, 5);
    expect(toLocalInput(d)).toBe("2030-05-04T09:05");
    expect(new Date(toLocalInput(d.toISOString())).getTime()).toBe(d.getTime());
    expect(toLocalInput("nonsense")).toBe("");
  });
});
