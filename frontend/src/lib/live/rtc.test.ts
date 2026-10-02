import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveAudioSupported, loadIceServers, newConnectionId, Poller } from "./rtc";

describe("loadIceServers", () => {
  it("uses the servers the API provides", async () => {
    const turn = [{ urls: "turn:turn.example.com", username: "u", credential: "p" }];
    expect(await loadIceServers({ iceServers: async () => ({ iceServers: turn }) })).toEqual(turn);
  });

  it("falls back to public STUN when the API has none or can't be reached", async () => {
    const stun = expect.arrayContaining([expect.objectContaining({ urls: expect.arrayContaining([expect.stringMatching(/^stun:/)]) })]);
    expect(await loadIceServers({ iceServers: async () => ({ iceServers: [] }) })).toEqual(stun);
    expect(await loadIceServers({ iceServers: async () => Promise.reject(new Error("offline")) })).toEqual(stun);
  });
});

describe("newConnectionId", () => {
  it("is different every time", () => {
    const ids = new Set(Array.from({ length: 50 }, newConnectionId));
    expect(ids.size).toBe(50);
  });
});

describe("liveAudioSupported", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false when the browser has no WebRTC, true when it does", () => {
    vi.stubGlobal("RTCPeerConnection", undefined);
    expect(liveAudioSupported()).toBe(false);
    vi.stubGlobal("RTCPeerConnection", class {});
    expect(liveAudioSupported()).toBe(true);
  });
});

describe("Poller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs straight away, then on every interval, until stopped", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    const poller = new Poller(tick, 1000);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(4);
    poller.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it("never runs two at once: a slow tick makes the next interval skip", async () => {
    let release!: () => void;
    const tick = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const poller = new Poller(tick, 1000);
    poller.start();
    await vi.advanceTimersByTimeAsync(3500); // three intervals pass while the first is still running
    expect(tick).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("keeps going after a failed tick, and starting twice doesn't double up", async () => {
    const tick = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const poller = new Poller(tick, 1000);
    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(tick).toHaveBeenCalledTimes(3);
    poller.stop();
  });
});
