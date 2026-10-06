import { describe, expect, it } from "vitest";
import { groupKey } from "./twoFactor";

describe("groupKey", () => {
  it("writes a setup key in groups of four", () => {
    expect(groupKey("ABCDEFGHIJKLMNOP")).toBe("ABCD EFGH IJKL MNOP");
    expect(groupKey("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")).toBe("ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567");
  });

  it("keeps a last short group, and copes with nothing", () => {
    expect(groupKey("ABCDEF")).toBe("ABCD EF");
    expect(groupKey("")).toBe("");
  });
});
