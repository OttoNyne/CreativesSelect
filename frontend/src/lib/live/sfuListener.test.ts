import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SfuListener } from "./sfuListener";
import type { ListenerState } from "./listener";
import { ApiError } from "../../api/client";
import { FakeRoom, FakeMediaStream, RoomEvent, fakeLiveKit, lastRoom } from "../../test/fakeLiveKit";

const audioTrack = { kind: "audio", mediaStreamTrack: { id: "remote-audio" } };

function setup(overrides: Partial<ConstructorParameters<typeof SfuListener>[0]> = {}) {
  const api = {
    join: vi.fn(async () => ({ live: {} as never })),
    leave: vi.fn(async () => undefined),
    token: vi.fn(async () => ({ url: "wss://demo.livekit.cloud", token: "listener-token" })),
    heartbeat: vi.fn(async (): Promise<{ status: "live" | "ended"; listenerCount: number }> => ({ status: "live", listenerCount: 12 })),
  };
  const states: ListenerState[] = [];
  const onStream = vi.fn();
  const onJoined = vi.fn();
  const onListenerCount = vi.fn();
  const listener = new SfuListener({ liveId: "live1", hostId: "host1", api, onState: (s) => states.push(s), onStream, onJoined, onListenerCount, loadClient: fakeLiveKit, heartbeatMs: 20_000, maxAttempts: 3, ...overrides });
  return { listener, api, states, onStream, onJoined, onListenerCount };
}
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  FakeRoom.reset();
  vi.stubGlobal("MediaStream", FakeMediaStream);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SfuListener: joining and playing", () => {
  it("joins, gets a listen-only pass, connects to the media server and says it is connecting", async () => {
    const { listener, api, states, onJoined } = setup();
    await listener.start();
    expect(api.join).toHaveBeenCalledWith("live1");
    expect(onJoined).toHaveBeenCalledTimes(1);
    expect(api.token).toHaveBeenCalledWith("live1");
    expect(lastRoom().connectedWith).toEqual({ url: "wss://demo.livekit.cloud", token: "listener-token" });
    expect(states).toEqual(["connecting"]);
    await listener.leave();
  });

  it("doesn't connect, or say it joined, when the room refuses (e.g. full)", async () => {
    const { listener, api, onJoined } = setup();
    api.join.mockRejectedValue(new ApiError(409, "This live is full (50 listeners)"));
    await expect(listener.start()).rejects.toThrow("full");
    expect(onJoined).not.toHaveBeenCalled();
    expect(FakeRoom.all).toHaveLength(0);
  });

  it("hands over the host's audio as it arrives and goes live", async () => {
    const { listener, states, onStream } = setup();
    await listener.start();
    lastRoom().emit(RoomEvent.TrackSubscribed, audioTrack);
    expect(onStream).toHaveBeenCalledTimes(1);
    expect((onStream.mock.calls[0][0] as FakeMediaStream).tracks).toEqual([audioTrack.mediaStreamTrack]);
    expect(states.at(-1)).toBe("live");
    await listener.leave();
  });

  it("ignores anything that isn't audio", async () => {
    const { listener, states, onStream } = setup();
    await listener.start();
    lastRoom().emit(RoomEvent.TrackSubscribed, { kind: "video", mediaStreamTrack: {} });
    expect(onStream).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe("connecting");
    await listener.leave();
  });

  it("reports the listener count from heartbeats", async () => {
    const { listener, onListenerCount } = setup();
    await listener.start();
    await settle();
    expect(onListenerCount).toHaveBeenCalledWith(12);
    await listener.leave();
  });

  it("shows reconnecting while the media client rides out a drop, then live again", async () => {
    const { listener, states } = setup();
    await listener.start();
    lastRoom().emit(RoomEvent.TrackSubscribed, audioTrack);
    lastRoom().emit(RoomEvent.Reconnecting);
    expect(states.at(-1)).toBe("reconnecting");
    lastRoom().emit(RoomEvent.Reconnected);
    expect(states.at(-1)).toBe("live");
    await listener.leave();
  });
});

describe("SfuListener: when the connection fails", () => {
  it("starts over with a fresh pass and room after the client gives up", async () => {
    const { listener, api, states } = setup();
    await listener.start();
    const first = lastRoom();
    first.emit(RoomEvent.Disconnected);
    await settle();
    expect(FakeRoom.all).toHaveLength(2);
    expect(first.disconnected).toBe(true);
    expect(api.token).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("reconnecting");
    await listener.leave();
  });

  it("gives up with 'failed' after the maximum number of attempts, and can be retried", async () => {
    const { listener, states } = setup();
    await listener.start();
    for (let i = 0; i < 2; i++) {
      lastRoom().emit(RoomEvent.Disconnected);
      await settle();
    }
    expect(FakeRoom.all).toHaveLength(3);
    lastRoom().emit(RoomEvent.Disconnected);
    await settle();
    expect(states.at(-1)).toBe("failed");
    expect(FakeRoom.all).toHaveLength(3); // no more attempts

    await listener.retry();
    expect(FakeRoom.all).toHaveLength(4);
    expect(states.at(-1)).toBe("connecting");
    await listener.leave();
  });

  it("counts a successful connection as a fresh start", async () => {
    const { listener, states } = setup({ maxAttempts: 2 });
    await listener.start();
    lastRoom().emit(RoomEvent.Disconnected);
    await settle();
    lastRoom().emit(RoomEvent.TrackSubscribed, audioTrack); // worked this time
    lastRoom().emit(RoomEvent.Disconnected);
    await settle();
    expect(FakeRoom.all).toHaveLength(3); // allowed, because success reset the count
    expect(states).not.toContain("failed");
    await listener.leave();
  });

  it("doesn't mistake the old room closing for a new failure (no recovery loop)", async () => {
    const { listener } = setup();
    await listener.start();
    const first = lastRoom();
    first.emit(RoomEvent.Disconnected);
    await settle();
    first.emit(RoomEvent.Disconnected); // the replaced room reports in again, late
    first.emit(RoomEvent.Disconnected);
    await settle();
    expect(FakeRoom.all).toHaveLength(2);
    await listener.leave();
  });

  it("retries when it can't get a pass or connect, then fails", async () => {
    const { listener, api, states } = setup();
    api.token.mockRejectedValue(new TypeError("offline"));
    await listener.start();
    await settle();
    await settle();
    await settle();
    expect(states.at(-1)).toBe("failed");
    expect(api.token).toHaveBeenCalledTimes(3);
  });

  it("shows 'ended' if the live is over by the time it asks for a pass", async () => {
    const { listener, api, states } = setup();
    api.token.mockRejectedValue(new ApiError(409, "This live has ended"));
    await listener.start();
    expect(states.at(-1)).toBe("ended");
  });
});

describe("SfuListener: the live ending, and leaving", () => {
  it("shows 'ended' when the heartbeat says the live is over", async () => {
    const { listener, api, states } = setup();
    api.heartbeat.mockResolvedValue({ status: "ended", listenerCount: 0 });
    await listener.start();
    await settle();
    expect(states.at(-1)).toBe("ended");
    // whatever room was opened has been left (the live may be over before one was even needed)
    expect(FakeRoom.all.every((r) => r.disconnected || r.connectedWith === null)).toBe(true);
  });

  it("treats being removed from the room (404/403, e.g. blocked) as the end", async () => {
    for (const status of [404, 403]) {
      const { listener, api, states } = setup();
      api.heartbeat.mockRejectedValue(new ApiError(status, "no"));
      await listener.start();
      await settle();
      expect(states.at(-1)).toBe("ended");
    }
  });

  it("checks with the server, rather than assuming, when the host drops out of the room", async () => {
    const { listener, api, states } = setup();
    await listener.start();
    await settle();
    const beats = api.heartbeat.mock.calls.length;
    lastRoom().emit(RoomEvent.ParticipantDisconnected, { identity: "someone-else" });
    await settle();
    expect(api.heartbeat.mock.calls.length).toBe(beats); // another listener leaving is irrelevant

    api.heartbeat.mockResolvedValue({ status: "ended", listenerCount: 0 });
    lastRoom().emit(RoomEvent.ParticipantDisconnected, { identity: "host1" });
    await settle();
    expect(api.heartbeat.mock.calls.length).toBe(beats + 1);
    expect(states.at(-1)).toBe("ended");
  });

  it("carries on through a network error", async () => {
    const { listener, api, states } = setup();
    api.heartbeat.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue({ status: "live", listenerCount: 1 });
    await listener.start();
    await settle();
    expect(states).not.toContain("ended");
    await listener.leave();
  });

  it("leaving tells the server, closes the connection and stops checking in; leaving twice is harmless", async () => {
    const { listener, api } = setup();
    await listener.start();
    await listener.leave();
    await listener.leave();
    expect(api.leave).toHaveBeenCalledTimes(1);
    expect(lastRoom().disconnected).toBe(true);
    const beats = api.heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.heartbeat.mock.calls.length).toBe(beats);
  });

  it("ignores late news after leaving", async () => {
    const { listener, states, onStream } = setup();
    await listener.start();
    const room = lastRoom();
    await listener.leave();
    const before = states.length;
    room.emit(RoomEvent.TrackSubscribed, audioTrack);
    room.emit(RoomEvent.Disconnected);
    await settle();
    expect(states.length).toBe(before);
    expect(onStream).not.toHaveBeenCalled();
    expect(FakeRoom.all).toHaveLength(1);
  });
});
