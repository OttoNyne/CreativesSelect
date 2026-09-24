import { describe, expect, it } from "vitest";
import { titleForPath } from "./usePageTitle";

describe("titleForPath", () => {
  it("names each page", () => {
    expect(titleForPath("/")).toBe("Feed · CreativesSelect");
    expect(titleForPath("/help-wanted")).toBe("Help wanted · CreativesSelect");
    expect(titleForPath("/login")).toBe("Log in · CreativesSelect");
    expect(titleForPath("/groups/abc123")).toBe("Group · CreativesSelect");
  });

  it("uses the username on profile pages", () => {
    expect(titleForPath("/u/zoe")).toBe("@zoe · CreativesSelect");
  });

  it("falls back to the site name", () => {
    expect(titleForPath("/nope/nothing")).toBe("CreativesSelect");
  });
});
