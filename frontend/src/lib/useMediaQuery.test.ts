import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsWideScreen, useMediaQuery } from "./useMediaQuery";

type Listener = () => void;
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const list = {
    matches: initial,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  const matchMedia = vi.fn(() => list);
  vi.stubGlobal("matchMedia", matchMedia);
  return { list, listeners, matchMedia, change: (next: boolean) => act(() => { list.matches = next; listeners.forEach((fn) => fn()); }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("says whether the query matches, and follows it as the screen changes", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
    expect(media.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
    media.change(true);
    expect(result.current).toBe(true);
    media.change(false);
    expect(result.current).toBe(false);
  });

  it("stops listening when it goes away", () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("is false where the browser can't say", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
  });

  it("counts tablets and up as wide", () => {
    const media = stubMatchMedia(true);
    renderHook(() => useIsWideScreen());
    expect(media.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
  });
});
