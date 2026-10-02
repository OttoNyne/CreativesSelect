import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveListener, type ListenerState } from "./listener";
import { ApiError } from "../../api/client";
import { FakePeer, lastPeer, makePeer } from "../../test/fakeRtc";
import type { LiveSignal } from "../../api/live.api";

const answer = (id: string, cid: string): LiveSignal => ({ id, from: "host1", kind: "answer", data: { cid, sdp: { type: "answer", sdp: "host-answer" } } });
const ice = (id: string, cid: string, candidate: unknown): LiveSignal => ({ id, from: "host1", kind: "ice", data: { cid, candidate } });

function setup(overrides: Partial<ConstructorParameters<typeof LiveListener>[0]> = {}) {
  const queue: LiveSignal[][] = [];
  const api = {
    join: vi.fn(async () => ({ live: {} as never })),
    leave: vi.fn(async () => undefined),
    signals: vi.fn(async () => ({ signals: queue.shift() ?? [] })),
    sendSignal: vi.fn(async () => ({ ok: true as const })),
    heartbeat: vi.fn(async (): Promise<{ status: "live" | "ended"; listenerCount: number }> => ({ status: "live", listenerCount: 2 })),
    iceServers: vi.fn(async () => ({ iceServers: [{ urls: "stun:example.org" }] })),
  };
  const states: ListenerState[] = [];
  const onStream = vi.fn();
  const onJoined = vi.fn();
  const onListenerCount = vi.fn();
  const listener = new LiveListener({
    liveId: "live1",
    hostId: "host1",
    api,
    onState: (s) => states.push(s),
    onStream,
    onJoined,
    onListenerCount,
    createPeer: makePeer,
    signalPollMs: 1000,
    heartbeatMs: 10_000,
    attemptTimeoutMs: 20_000,
    disconnectGraceMs: 5000,
    maxAttempts: 3,
    ...overrides,
  });
  return { listener, api, queue, states, onStream, onJoined, onListenerCount };
}
const tick = (ms = 1000) => vi.advanceTimersByTimeAsync(ms);
const offersSent = (api: ReturnType<typeof setup>["api"]) =>
  (api.sendSignal.mock.calls as unknown as [string, { kind: string; data: { cid: string } }][]).filter(([, s]) => s.kind === "offer").map(([, s]) => s);

beforeEach(() => {
  vi.useFakeTimers();
  FakePeer.reset();
});
afterEach(() => vi.useRealTimers());

describe("LiveListener: joining and connecting", () => {
  it("joins, then offers to receive the host's audio, addressed to the host", async () => {
    const { listener, api, states, onJoined } = setup();
    await listener.start();
    expect(api.join).toHaveBeenCalledWith("live1");
    expect(onJoined).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["connecting"]);

    const peer = lastPeer();
    expect(peer.config.iceServers).toEqual([{ urls: "stun:example.org" }]);
    expect(peer.transceivers).toEqual([{ kind: "audio", init: { direction: "recvonly" } }]); // listens, never sends
    expect(peer.addedTracks).toEqual([]);
    const [offer] = offersSent(api);
    expect(api.sendSignal).toHaveBeenCalledWith("live1", { to: "host1", kind: "offer", data: { cid: offer.data.cid, sdp: { type: "offer", sdp: "fake-offer-sdp" } } });
    await listener.leave();
  });

  it("doesn't connect, or report being joined, when the room refuses us", async () => {
    const { listener, api, onJoined, states } = setup();
    api.join.mockRejectedValue(new ApiError(409, "This live is full (8 listeners)"));
    await expect(listener.start()).rejects.toThrow("This live is full");
    expect(onJoined).not.toHaveBeenCalled();
    expect(FakePeer.all).toHaveLength(0);
    expect(states).toEqual([]);
  });

  it("goes live once connected, and hands over the incoming audio", async () => {
    const { listener, states, onStream } = setup();
    await listener.start();
    const stream = lastPeer().receiveAudio();
    expect(onStream).toHaveBeenCalledWith(stream);
    lastPeer().setState("connected");
    expect(states.at(-1)).toBe("live");
    await listener.leave();
  });

  it("applies the host's answer when its connection id matches, and ignores answers from other attempts", async () => {
    const { listener, api, queue } = setup();
    await listener.start();
    const cid = offersSent(api)[0].data.cid;
    queue.push([answer("s1", "some-old-attempt")]);
    await tick(1000);
    expect(lastPeer().remoteDescription).toBeNull();
    queue.push([answer("s2", cid)]);
    await tick(1000);
    expect(lastPeer().remoteDescription).toEqual({ type: "answer", sdp: "host-answer" });
    await listener.leave();
  });

  it("holds the host's network candidates until its answer has been applied", async () => {
    const { listener, api, queue } = setup();
    await listener.start();
    const cid = offersSent(api)[0].data.cid;
    queue.push([ice("s1", cid, { candidate: "early" }), ice("s2", "stale", { candidate: "wrong attempt" })]);
    await tick(1000);
    expect(lastPeer().candidates).toEqual([]); // too early: kept waiting
    queue.push([answer("s3", cid), ice("s4", cid, { candidate: "late" })]);
    await tick(1000);
    expect(lastPeer().candidates).toEqual([{ candidate: "early" }, { candidate: "late" }]);
    await listener.leave();
  });

  it("sends its own candidates to the host, tagged with the connection id", async () => {
    const { listener, api } = setup();
    await listener.start();
    const cid = offersSent(api)[0].data.cid;
    lastPeer().gatherCandidate({ candidate: "mine" });
    expect(api.sendSignal).toHaveBeenCalledWith("live1", { to: "host1", kind: "ice", data: { cid, candidate: { candidate: "mine" } } });
    await listener.leave();
  });

  it("stops polling for handshake messages once connected, and starts again when it has to reconnect", async () => {
    const { listener, api } = setup();
    await listener.start();
    await tick(2000);
    const whileConnecting = api.signals.mock.calls.length;
    expect(whileConnecting).toBeGreaterThan(1);
    lastPeer().setState("connected");
    await tick(10_000);
    expect(api.signals.mock.calls.length).toBe(whileConnecting); // quiet while connected
    lastPeer().setState("failed");
    await tick(2000);
    expect(api.signals.mock.calls.length).toBeGreaterThan(whileConnecting); // reconnecting: polling again
    await listener.leave();
  });

  it("reports the listener count from heartbeats", async () => {
    const { listener, onListenerCount } = setup();
    await listener.start();
    await tick(0);
    expect(onListenerCount).toHaveBeenCalledWith(2);
    await listener.leave();
  });

  it("says 'failed' (not a crash) when the browser can't create a connection", async () => {
    const { listener, states } = setup();
    FakePeer.failToCreate = true;
    await listener.start();
    expect(states.at(-1)).toBe("failed");
    await listener.leave();
  });
});

describe("LiveListener: keeping the connection going", () => {
  it("starts over with a fresh connection id after a connection failure, and closes the old one", async () => {
    const { listener, api, states } = setup();
    await listener.start();
    const first = lastPeer();
    first.setState("failed");
    await tick(0);
    expect(first.closed).toBe(true);
    expect(FakePeer.all).toHaveLength(2);
    expect(states.at(-1)).toBe("reconnecting");
    const [a, b] = offersSent(api);
    expect(b.data.cid).not.toBe(a.data.cid);
    await listener.leave();
  });

  it("gives a dropped connection a few seconds to heal on its own before starting over", async () => {
    const { listener, states } = setup();
    await listener.start();
    lastPeer().setState("connected");
    lastPeer().setState("disconnected");
    expect(states.at(-1)).toBe("reconnecting");
    await tick(3000);
    expect(FakePeer.all).toHaveLength(1); // still waiting
    lastPeer().setState("connected"); // it healed
    await tick(10_000);
    expect(FakePeer.all).toHaveLength(1);
    expect(states.at(-1)).toBe("live");
    await listener.leave();
  });

  it("starts over if a dropped connection doesn't come back in time", async () => {
    const { listener } = setup();
    await listener.start();
    lastPeer().setState("connected");
    lastPeer().setState("disconnected");
    await tick(5000);
    expect(FakePeer.all).toHaveLength(2);
    await listener.leave();
  });

  it("retries an attempt that never connects, then gives up with 'failed' after the maximum", async () => {
    const { listener, states } = setup();
    await listener.start();
    await tick(20_000);
    expect(FakePeer.all).toHaveLength(2);
    await tick(20_000);
    expect(FakePeer.all).toHaveLength(3);
    await tick(20_000);
    expect(FakePeer.all).toHaveLength(3); // no more attempts
    expect(states.at(-1)).toBe("failed");
    expect(lastPeer().closed).toBe(true);
    await listener.leave();
  });

  it("lets the person try again after it has failed", async () => {
    const { listener, states } = setup({ maxAttempts: 1 });
    await listener.start();
    await tick(20_000);
    expect(states.at(-1)).toBe("failed");
    await listener.retry();
    expect(FakePeer.all).toHaveLength(2);
    expect(states.at(-1)).toBe("connecting");
    await listener.leave();
  });

  it("resets the attempt count once connected, so a later drop gets fresh retries", async () => {
    const { listener } = setup({ maxAttempts: 2 });
    await listener.start();
    lastPeer().setState("failed");
    await tick(0);
    lastPeer().setState("connected"); // second attempt works
    lastPeer().setState("failed");
    await tick(0);
    expect(FakePeer.all).toHaveLength(3); // allowed because success reset the count
    await listener.leave();
  });
});

describe("LiveListener: the live ending, and leaving", () => {
  it("shows 'ended' and stops when the heartbeat says the live is over", async () => {
    const { listener, api, states } = setup();
    api.heartbeat.mockResolvedValue({ status: "ended", listenerCount: 0 });
    await listener.start();
    await tick(0);
    expect(states.at(-1)).toBe("ended");
    expect(lastPeer().closed).toBe(true);
    const polls = api.signals.mock.calls.length;
    await tick(5000);
    expect(api.signals.mock.calls.length).toBe(polls);
  });

  it("treats being removed from the room (404/403, e.g. blocked) as the end", async () => {
    for (const status of [404, 403]) {
      const { listener, api, states } = setup();
      api.heartbeat.mockRejectedValue(new ApiError(status, "no"));
      await listener.start();
      await tick(0);
      expect(states.at(-1)).toBe("ended");
    }
  });

  it("carries on through a network error", async () => {
    const { listener, api, states } = setup();
    api.heartbeat.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ status: "live", listenerCount: 1 });
    await listener.start();
    await tick(0);
    expect(states).not.toContain("ended");
    await listener.leave();
  });

  it("says 'ended' if the host's end arrives while the offer is being sent", async () => {
    const { listener, api, states } = setup();
    api.sendSignal.mockRejectedValue(new ApiError(409, "This live has ended"));
    await listener.start();
    expect(states.at(-1)).toBe("ended");
  });

  it("leaving tells the server, closes the connection and stops polling; leaving twice is harmless", async () => {
    const { listener, api } = setup();
    await listener.start();
    await listener.leave();
    await listener.leave();
    expect(api.leave).toHaveBeenCalledTimes(1);
    expect(api.leave).toHaveBeenCalledWith("live1");
    expect(lastPeer().closed).toBe(true);
    const polls = api.signals.mock.calls.length;
    const beats = api.heartbeat.mock.calls.length;
    await tick(30_000);
    expect(api.signals.mock.calls.length).toBe(polls);
    expect(api.heartbeat.mock.calls.length).toBe(beats);
  });

  it("doesn't change state after leaving, even if the old connection reports in late", async () => {
    const { listener, states } = setup();
    await listener.start();
    const peer = lastPeer();
    await listener.leave();
    const before = states.length;
    peer.setState("connected");
    peer.setState("failed");
    await tick(0);
    expect(states.length).toBe(before);
    expect(FakePeer.all).toHaveLength(1);
  });
});
