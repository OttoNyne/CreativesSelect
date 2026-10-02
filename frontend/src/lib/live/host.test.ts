import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveHost } from "./host";
import { ApiError } from "../../api/client";
import { FakePeer, FakeStream, makePeer } from "../../test/fakeRtc";
import type { LiveSignal } from "../../api/live.api";

const offer = (id: string, from: string, cid: string): LiveSignal => ({ id, from, kind: "offer", data: { cid, sdp: { type: "offer", sdp: "listener-offer" } } });
const ice = (id: string, from: string, cid: string, candidate: unknown): LiveSignal => ({ id, from, kind: "ice", data: { cid, candidate } });

function setup(overrides: Partial<ConstructorParameters<typeof LiveHost>[0]> = {}) {
  const stream = new FakeStream();
  const queue: LiveSignal[][] = [];
  const api = {
    signals: vi.fn(async () => ({ signals: queue.shift() ?? [] })),
    sendSignal: vi.fn(async () => ({ ok: true as const })),
    heartbeat: vi.fn(async (): Promise<{ status: "live" | "ended"; listenerCount: number }> => ({ status: "live", listenerCount: 0 })),
    iceServers: vi.fn(async () => ({ iceServers: [{ urls: "stun:example.org" }] })),
  };
  const onListenerCount = vi.fn();
  const onEnded = vi.fn();
  const host = new LiveHost({
    liveId: "live1",
    stream: stream.asStream(),
    api,
    onListenerCount,
    onEnded,
    createPeer: makePeer,
    signalPollMs: 1000,
    heartbeatMs: 10_000,
    ...overrides,
  });
  return { host, stream, api, queue, onListenerCount, onEnded };
}
const tick = (ms = 1000) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  FakePeer.reset();
});
afterEach(() => vi.useRealTimers());

describe("LiveHost: answering listeners", () => {
  it("answers an offer with the microphone attached, addressed to that listener with the same connection id", async () => {
    const { host, stream, api, queue } = setup();
    queue.push([offer("s1", "listener-a", "cid-1")]);
    host.start();
    await tick(0);

    const [peer] = FakePeer.all;
    expect(peer.config.iceServers).toEqual([{ urls: "stun:example.org" }]);
    expect(peer.addedTracks).toEqual(stream.tracks);
    expect(peer.remoteDescription).toEqual({ type: "offer", sdp: "listener-offer" });
    expect(api.sendSignal).toHaveBeenCalledWith("live1", { to: "listener-a", kind: "answer", data: { cid: "cid-1", sdp: { type: "answer", sdp: "fake-answer-sdp" } } });
    host.stop();
  });

  it("gives each listener a connection of their own", async () => {
    const { host, queue } = setup();
    queue.push([offer("s1", "listener-a", "a1"), offer("s2", "listener-b", "b1")]);
    host.start();
    await tick(0);
    expect(FakePeer.all).toHaveLength(2);
    host.stop();
  });

  it("sends its own network candidates to that listener, tagged with the connection id", async () => {
    const { host, api, queue } = setup();
    queue.push([offer("s1", "listener-a", "cid-1")]);
    host.start();
    await tick(0);
    FakePeer.all[0].gatherCandidate({ candidate: "cand-1" });
    expect(api.sendSignal).toHaveBeenCalledWith("live1", { to: "listener-a", kind: "ice", data: { cid: "cid-1", candidate: { candidate: "cand-1" } } });
    host.stop();
  });

  it("applies a listener's candidates only to the matching, current connection", async () => {
    const { host, queue } = setup();
    queue.push([offer("s1", "listener-a", "cid-1")]);
    queue.push([
      ice("s2", "listener-a", "cid-1", { candidate: "good" }),
      ice("s3", "listener-a", "old-cid", { candidate: "stale" }), // from an earlier attempt
      ice("s4", "stranger", "cid-1", { candidate: "unknown listener" }), // no connection for them
    ]);
    host.start();
    await tick(1000);
    expect(FakePeer.all[0].candidates).toEqual([{ candidate: "good" }]);
    host.stop();
  });

  it("replaces the old connection when a listener reconnects with a new offer", async () => {
    const { host, queue } = setup();
    queue.push([offer("s1", "listener-a", "first")]);
    queue.push([offer("s2", "listener-a", "second")]);
    host.start();
    await tick(1000);
    expect(FakePeer.all).toHaveLength(2);
    expect(FakePeer.all[0].closed).toBe(true);
    expect(FakePeer.all[1].closed).toBe(false);
    // candidates for the new attempt go to the new connection
    queue.push([ice("s3", "listener-a", "second", { candidate: "new" })]);
    await tick(1000);
    expect(FakePeer.all[1].candidates).toEqual([{ candidate: "new" }]);
    host.stop();
  });

  it("drops a connection that fails, and counts only connected listeners", async () => {
    const { host, queue } = setup();
    queue.push([offer("s1", "a", "1"), offer("s2", "b", "2")]);
    host.start();
    await tick(0);
    FakePeer.all[0].setState("connected");
    expect(host.connectedListeners).toBe(1);
    FakePeer.all[0].setState("failed");
    expect(FakePeer.all[0].closed).toBe(true);
    expect(host.connectedListeners).toBe(0);
    host.stop();
  });

  it("ignores an offer with no connection id or description", async () => {
    const { host, queue } = setup();
    queue.push([{ id: "s1", from: "a", kind: "offer", data: { sdp: { type: "offer", sdp: "x" } } }, { id: "s2", from: "a", kind: "offer", data: { cid: "c" } }]);
    host.start();
    await tick(0);
    expect(FakePeer.all).toHaveLength(0);
    host.stop();
  });

  it("only asks for signals newer than the last one it handled", async () => {
    const { host, api, queue } = setup();
    queue.push([offer("s1", "a", "1"), ice("s2", "a", "1", {})]);
    host.start();
    await tick(0);
    expect(api.signals).toHaveBeenLastCalledWith("live1", undefined);
    await tick(1000);
    expect(api.signals).toHaveBeenLastCalledWith("live1", "s2");
    host.stop();
  });

  it("keeps handling signals after one of them fails", async () => {
    const { host, queue } = setup();
    let first = true;
    const original = FakePeer.prototype.setRemoteDescription;
    FakePeer.prototype.setRemoteDescription = async function (d) {
      if (first) {
        first = false;
        throw new Error("bad sdp");
      }
      return original.call(this, d);
    };
    try {
      queue.push([offer("s1", "a", "1"), offer("s2", "b", "2")]);
      host.start();
      await tick(0);
      expect(FakePeer.all[1].remoteDescription).toEqual({ type: "offer", sdp: "listener-offer" });
    } finally {
      FakePeer.prototype.setRemoteDescription = original;
      host.stop();
    }
  });
});

describe("LiveHost: the microphone", () => {
  it("mutes and unmutes by switching the audio track, leaving the microphone open", () => {
    const { host, stream } = setup();
    host.setMuted(true);
    expect(stream.tracks[0].enabled).toBe(false);
    expect(stream.tracks[0].stopped).toBe(false);
    host.setMuted(false);
    expect(stream.tracks[0].enabled).toBe(true);
  });

  it("stopping closes every connection, turns the microphone off and stops polling", async () => {
    const { host, stream, api, queue } = setup();
    queue.push([offer("s1", "a", "1")]);
    host.start();
    await tick(0);
    host.stop();
    expect(FakePeer.all[0].closed).toBe(true);
    expect(stream.tracks[0].stopped).toBe(true);
    const polls = api.signals.mock.calls.length;
    await tick(5000);
    expect(api.signals.mock.calls.length).toBe(polls);
  });
});

describe("LiveHost: heartbeat", () => {
  it("reports the listener count from each heartbeat", async () => {
    const { host, api, onListenerCount } = setup();
    api.heartbeat.mockResolvedValue({ status: "live", listenerCount: 3 });
    host.start();
    await tick(0);
    expect(onListenerCount).toHaveBeenCalledWith(3);
    await tick(10_000);
    expect(api.heartbeat).toHaveBeenCalledTimes(2);
    host.stop();
  });

  it("finishes when the server says the live is over: tells the page and turns the microphone off", async () => {
    const { host, api, stream, onEnded } = setup();
    api.heartbeat.mockResolvedValue({ status: "ended", listenerCount: 0 });
    host.start();
    await tick(0);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(stream.tracks[0].stopped).toBe(true);
    await tick(20_000);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("treats a missing live (404) or being locked out (403) as the end", async () => {
    for (const status of [404, 403]) {
      const { host, api, onEnded } = setup();
      api.heartbeat.mockRejectedValue(new ApiError(status, "gone"));
      host.start();
      await tick(0);
      expect(onEnded).toHaveBeenCalledTimes(1);
    }
  });

  it("carries on through a network error rather than ending the live", async () => {
    const { host, api, stream, onEnded } = setup();
    api.heartbeat.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ status: "live", listenerCount: 1 });
    host.start();
    await tick(0);
    expect(onEnded).not.toHaveBeenCalled();
    expect(stream.tracks[0].stopped).toBe(false);
    await tick(10_000);
    expect(api.heartbeat).toHaveBeenCalledTimes(2);
    host.stop();
  });
});
