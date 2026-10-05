import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NowPlayingBar } from "./NowPlayingBar";
import { usePlayback } from "../../context/PlaybackContext";
import type { Track } from "../../types";

vi.mock("../../context/PlaybackContext", () => ({ usePlayback: vi.fn() }));
vi.mock("../../lib/youtubeIframeApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/youtubeIframeApi")>()),
  loadYouTubeIframeApi: vi.fn().mockResolvedValue(undefined),
}));

const upload: Track = { id: "t1", ownerId: "u", title: "My demo", sourceType: "upload", url: "https://cdn.example.com/a.m4a", position: 0, createdAt: "" };
const video: Track = { id: "t2", ownerId: "u", title: "A video", sourceType: "youtube", url: "abc123XYZ_0", position: 1, createdAt: "" };

const playNext = vi.fn();
const stop = vi.fn();
const toggle = vi.fn();
function setPlayback(over: Record<string, unknown> = {}) {
  vi.mocked(usePlayback).mockReturnValue({ current: upload, queue: [], play: vi.fn(), playNext, stop, isPlaying: true, toggle, error: null, ...over } as never);
}

// A stand-in for YouTube's player that lets the test fire its events.
let playerOptions: { events: Record<string, (e: unknown) => void> };
const playVideo = vi.fn();
const destroy = vi.fn();
class FakeYTPlayer {
  constructor(_id: string, options: { events: Record<string, (e: unknown) => void> }) {
    playerOptions = options;
  }
  playVideo = playVideo;
  pauseVideo = vi.fn();
  destroy = destroy;
}

beforeEach(() => {
  [playNext, stop, toggle, playVideo, destroy].forEach((f) => f.mockReset());
  window.YT = { Player: FakeYTPlayer as never, PlayerState: { ENDED: 0, PLAYING: 1 } };
});
afterEach(() => {
  delete window.YT;
});

describe("NowPlayingBar", () => {
  it("shows nothing when nothing is playing", () => {
    setPlayback({ current: null });
    const { container } = render(<NowPlayingBar />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("an uploaded song", () => {
    it("shows the title and state with a pause button, and no video", () => {
      setPlayback();
      render(<NowPlayingBar />);
      expect(screen.getByText("My demo")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Playing");
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      expect(document.querySelector("iframe")).toBeNull();
    });

    it("offers play when paused, and the button calls toggle", async () => {
      setPlayback({ isPlaying: false });
      render(<NowPlayingBar />);
      expect(screen.getByRole("status")).toHaveTextContent("Paused");
      await userEvent.click(screen.getByRole("button", { name: "Play" }));
      expect(toggle).toHaveBeenCalled();
    });

    it("shows why it isn't playing, e.g. when a tap is needed", () => {
      setPlayback({ isPlaying: false, error: "Tap play to start the music." });
      render(<NowPlayingBar />);
      expect(screen.getByRole("status")).toHaveTextContent("Tap play to start the music.");
    });

    it("skips and stops", async () => {
      setPlayback();
      render(<NowPlayingBar />);
      await userEvent.click(screen.getByRole("button", { name: /Skip/ }));
      expect(playNext).toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Stop" }));
      expect(stop).toHaveBeenCalled();
    });
  });

  describe("a YouTube track", () => {
    beforeEach(() => setPlayback({ current: video }));

    it("embeds the player big enough to see and tap, set up for iPhones", () => {
      render(<NowPlayingBar />);
      const frame = document.querySelector("iframe") as HTMLIFrameElement;
      const src = new URL(frame.src);
      expect(src.pathname).toBe("/embed/abc123XYZ_0");
      expect(src.searchParams.get("playsinline")).toBe("1"); // stay in the page on an iPhone
      expect(src.searchParams.get("enablejsapi")).toBe("1");
      expect(src.searchParams.get("origin")).toBe(window.location.origin);
      expect(frame.className).toMatch(/h-\[200px\]/); // YouTube needs 200px or more
      expect(frame.getAttribute("allow")).toMatch(/autoplay/);
      expect(screen.getByRole("status")).toHaveTextContent("Playing via YouTube");
      expect(screen.queryByRole("button", { name: /^(Play|Pause)$/ })).not.toBeInTheDocument();
    });

    it("is a small window in the corner of the page with its controls under the video, not a full-width bar", () => {
      render(<NowPlayingBar />);
      const frame = document.querySelector("iframe") as HTMLIFrameElement;
      const card = frame.parentElement as HTMLElement;
      expect(card.className).toMatch(/fixed/);
      expect(card.className).toMatch(/bottom-2/);
      expect(card.className).toMatch(/right-2/);
      expect(card.className).toContain("w-[min(224px,"); // 224 pixels wide (less on a very narrow screen)
      expect(card.className).not.toMatch(/left-0/); // it doesn't stretch across the page
      // the title, the state and the buttons are in the same small window, under the video
      expect(card).toContainElement(screen.getByText("A video"));
      expect(card).toContainElement(screen.getByRole("status"));
      expect(card).toContainElement(screen.getByRole("button", { name: /Skip/ }));
      expect(card).toContainElement(screen.getByRole("button", { name: "Stop" }));
      expect(frame.className).toContain("h-[200px]"); // still the 200 pixels YouTube asks for
    });

    it("tells the player to start as soon as it is ready", async () => {
      render(<NowPlayingBar />);
      await waitFor(() => expect(playerOptions).toBeDefined());
      act(() => playerOptions.events.onReady({}));
      expect(playVideo).toHaveBeenCalled();
    });

    it("asks for a tap when the browser blocks autoplay, and drops the message once it plays", async () => {
      render(<NowPlayingBar />);
      await waitFor(() => expect(playerOptions).toBeDefined());
      act(() => playerOptions.events.onAutoplayBlocked({}));
      expect(screen.getByRole("status")).toHaveTextContent("Tap play to start");
      act(() => playerOptions.events.onStateChange({ data: 1 }));
      expect(screen.getByRole("status")).toHaveTextContent("Playing via YouTube");
    });

    it("moves to the next track when the video ends", async () => {
      render(<NowPlayingBar />);
      await waitFor(() => expect(playerOptions).toBeDefined());
      act(() => playerOptions.events.onStateChange({ data: 0 }));
      expect(playNext).toHaveBeenCalled();
    });

    it("explains a video whose owner blocks embedding, with a link to watch it on YouTube", async () => {
      render(<NowPlayingBar />);
      await waitFor(() => expect(playerOptions).toBeDefined());
      act(() => playerOptions.events.onError({ data: 101 }));
      expect(screen.getByRole("status")).toHaveTextContent("The owner of this video doesn't allow it to be played here.");
      expect(screen.getByRole("link", { name: "Open on YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123XYZ_0");
    });

    it("explains a removed or private video differently", async () => {
      render(<NowPlayingBar />);
      await waitFor(() => expect(playerOptions).toBeDefined());
      act(() => playerOptions.events.onError({ data: 100 }));
      expect(screen.getByRole("status")).toHaveTextContent("This video isn't available.");
    });

    it("doesn't touch YouTube at all for an uploaded song", () => {
      setPlayback();
      render(<NowPlayingBar />);
      expect(playVideo).not.toHaveBeenCalled();
    });
  });
});

describe("NowPlayingBar: an uploaded song keeps the full-width bar", () => {
  it("is a bar across the bottom of the page, with no video", () => {
    setPlayback();
    render(<NowPlayingBar />);
    const bar = screen.getByRole("status").closest(".fixed") as HTMLElement;
    expect(bar.className).toMatch(/bottom-0/);
    expect(bar.className).toMatch(/left-0/);
    expect(bar.className).toMatch(/right-0/);
  });
});
