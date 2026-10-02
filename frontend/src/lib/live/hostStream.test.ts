import { beforeEach, describe, expect, it } from "vitest";
import { clearStreamFor, getStreamFor, holdStreamFor, micErrorMessage } from "./hostStream";
import { FakeStream } from "../../test/fakeRtc";

beforeEach(() => {
  clearStreamFor("a");
  clearStreamFor("b");
});

describe("hostStream", () => {
  it("hands a held microphone to the live it was held for, and only to that one", () => {
    const stream = new FakeStream().asStream();
    holdStreamFor("a", stream);
    expect(getStreamFor("a")).toBe(stream);
    expect(getStreamFor("b")).toBeNull();
  });

  it("can be looked at more than once (React may run an effect twice in development)", () => {
    const stream = new FakeStream().asStream();
    holdStreamFor("a", stream);
    expect(getStreamFor("a")).toBe(stream);
    expect(getStreamFor("a")).toBe(stream);
  });

  it("can be cleared", () => {
    holdStreamFor("a", new FakeStream().asStream());
    clearStreamFor("a");
    expect(getStreamFor("a")).toBeNull();
    clearStreamFor("b"); // clearing a different live leaves it alone
    holdStreamFor("a", new FakeStream().asStream());
    clearStreamFor("b");
    expect(getStreamFor("a")).not.toBeNull();
  });

  it("turns off a microphone that was never used when another is held in its place", () => {
    const first = new FakeStream();
    holdStreamFor("a", first.asStream());
    holdStreamFor("b", new FakeStream().asStream());
    expect(first.tracks[0].stopped).toBe(true);
  });
});

describe("micErrorMessage", () => {
  it("explains each way the microphone can fail", () => {
    expect(micErrorMessage(new DOMException("x", "NotAllowedError"))).toMatch(/blocked/);
    expect(micErrorMessage(new DOMException("x", "SecurityError"))).toMatch(/blocked/);
    expect(micErrorMessage(new DOMException("x", "NotFoundError"))).toMatch(/No microphone/);
    expect(micErrorMessage(new DOMException("x", "NotReadableError"))).toMatch(/in use/);
    expect(micErrorMessage(new Error("weird"))).toBe("Couldn't start your microphone.");
  });
});
