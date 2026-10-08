import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRobots } from "./useRobots";

const tags = () => [...document.head.querySelectorAll('meta[name="robots"]')].map((m) => m.getAttribute("content"));

describe("useRobots", () => {
  it("keeps the page out of search engines, or lets it in, and takes the tag away when the page is left", () => {
    const out = renderHook(() => useRobots(false));
    expect(tags()).toEqual(["noindex,nofollow"]);
    out.unmount();
    expect(tags()).toEqual([]);
    const listed = renderHook(() => useRobots(true));
    expect(tags()).toEqual(["index,follow"]);
    listed.unmount();
    expect(tags()).toEqual([]);
  });
  it("says nothing while it isn't known yet", () => {
    renderHook(() => useRobots(null));
    expect(tags()).toEqual([]);
  });
  it("follows a change", () => {
    const { rerender } = renderHook(({ on }) => useRobots(on), { initialProps: { on: false } });
    rerender({ on: true });
    expect(tags()).toEqual(["index,follow"]);
  });
});
