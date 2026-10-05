import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { COUNT_AFTER_MS, PlayCounter } from "./PlayCounter";
import { tracksApi } from "../../api/tracks.api";
import { useAuth } from "../../context/AuthContext";
import { usePlayback } from "../../context/PlaybackContext";
import type { Track, User } from "../../types";

vi.mock("../../api/tracks.api", () => ({ tracksApi: { played: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../context/PlaybackContext", () => ({ usePlayback: vi.fn() }));

const track = (id: string, ownerId = "owner"): Track => ({ id, ownerId, title: "Song", sourceType: "youtube", url: "x", position: 0, createdAt: "" }) as Track;

function setup(current: Track | null, signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? ({ id: "me" } as User) : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  vi.mocked(usePlayback).mockReturnValue({ current } as never);
  return render(<PlayCounter />);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(tracksApi.played).mockReset();
  vi.mocked(tracksApi.played).mockResolvedValue({ counted: true, plays: 1 });
});
afterEach(() => vi.useRealTimers());

const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("PlayCounter", () => {
  it("tells the server about someone else's song once it has been listened to for a while", async () => {
    setup(track("t1"));
    await wait(COUNT_AFTER_MS - 1000);
    expect(tracksApi.played).not.toHaveBeenCalled();
    await wait(1500);
    expect(tracksApi.played).toHaveBeenCalledTimes(1);
    expect(tracksApi.played).toHaveBeenCalledWith("t1");
  });

  it("doesn't count a song that was skipped before the time was up", async () => {
    const view = setup(track("t1"));
    await wait(COUNT_AFTER_MS - 2000);
    vi.mocked(usePlayback).mockReturnValue({ current: track("t2") } as never);
    view.rerender(<PlayCounter />);
    await wait(COUNT_AFTER_MS - 1000);
    expect(tracksApi.played).not.toHaveBeenCalled();
    await wait(2000);
    expect(tracksApi.played).toHaveBeenCalledTimes(1);
    expect(tracksApi.played).toHaveBeenCalledWith("t2");
  });

  it("doesn't count nothing playing, your own songs, or anyone who isn't signed in", async () => {
    setup(null);
    await wait(COUNT_AFTER_MS * 2);
    const own = setup(track("t1", "me"));
    await wait(COUNT_AFTER_MS * 2);
    own.unmount();
    setup(track("t1"), false);
    await wait(COUNT_AFTER_MS * 2);
    expect(tracksApi.played).not.toHaveBeenCalled();
  });

  it("carries on quietly if the server can't be reached", async () => {
    vi.mocked(tracksApi.played).mockRejectedValue(new Error("offline"));
    setup(track("t1"));
    await wait(COUNT_AFTER_MS + 500);
    expect(tracksApi.played).toHaveBeenCalledTimes(1);
  });
});
