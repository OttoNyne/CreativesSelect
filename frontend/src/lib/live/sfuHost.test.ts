import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SfuHost } from "./sfuHost";
import { ApiError } from "../../api/client";
import { FakeStream } from "../../test/fakeRtc";
import { FakeMediaStream, FakeRoom, RoomEvent, fakeLiveKit, lastRoom } from "../../test/fakeLiveKit";

function setup(overrides: Partial<ConstructorParameters<typeof SfuHost>[0]> = {}) {
  const stream = new FakeStream();
  const api = {
    token: vi.fn(async () => ({ url: "wss://demo.livekit.cloud", token: "host-token" })),
    heartbeat: vi.fn(async (): Promise<{ status: "live" | "ended"; listenerCount: number }> => ({ status: "live", listenerCount: 0 })),
  };
  const onListenerCount = vi.fn();
  const onEnded = vi.fn();
  const onFailed = vi.fn();
  const host = new SfuHost({ liveId: "live1", stream: stream.asStream(), api, onListenerCount, onEnded, onFailed, loadClient: fakeLiveKit, heartbeatMs: 20_000, ...overrides });
  return { host, stream, api, onListenerCount, onEnded, onFailed };
}
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  FakeRoom.reset();
});
afterEach(() => vi.useRealTimers());

describe("SfuHost", () => {
  it("connects to the media server with the host's pass and publishes the microphone once", async () => {
    const { host, stream, api } = setup();
    host.start();
    await settle();
    expect(api.token).toHaveBeenCalledWith("live1");
    expect(lastRoom().connectedWith).toEqual({ url: "wss://demo.livekit.cloud", token: "host-token" });
    expect(lastRoom().published).toEqual([{ track: stream.tracks[0], options: { source: "microphone", name: "microphone" } }]);
    host.stop();
  });

  it("reports the listener count from each heartbeat", async () => {
    const { host, api, onListenerCount } = setup();
    api.heartbeat.mockResolvedValue({ status: "live", listenerCount: 42 });
    host.start();
    await settle();
    expect(onListenerCount).toHaveBeenCalledWith(42);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.heartbeat).toHaveBeenCalledTimes(2);
    host.stop();
  });

  it("finishes when the server says the live is over: leaves the room and turns the microphone off", async () => {
    const { host, api, stream, onEnded } = setup();
    host.start();
    await settle();
    api.heartbeat.mockResolvedValue({ status: "ended", listenerCount: 0 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(lastRoom().disconnected).toBe(true);
    expect(stream.tracks[0].stopped).toBe(true);
  });

  it("treats a missing or forbidden live as the end, and carries on through a network error", async () => {
    for (const status of [404, 403]) {
      const { host, api, onEnded } = setup();
      api.heartbeat.mockRejectedValue(new ApiError(status, "no"));
      host.start();
      await settle();
      expect(onEnded).toHaveBeenCalledTimes(1);
    }
    const { host, api, onEnded } = setup();
    api.heartbeat.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue({ status: "live", listenerCount: 1 });
    host.start();
    await settle();
    expect(onEnded).not.toHaveBeenCalled();
    host.stop();
  });

  it("says so when it can't get a pass or connect, using the server's own words when it has them", async () => {
    const a = setup();
    a.api.token.mockRejectedValue(new ApiError(403, "Join this live first"));
    a.host.start();
    await settle();
    expect(a.onFailed).toHaveBeenCalledWith("Join this live first");
    a.host.stop();

    // a network failure is tried again a few times before it is given up on
    FakeRoom.failConnect = new Error("websocket refused");
    const b = setup();
    b.host.start();
    await settle();
    expect(b.onFailed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(b.onFailed).toHaveBeenCalledWith("Couldn't connect to the live audio service.");
    expect(FakeRoom.all).toHaveLength(3);
    b.host.stop();
  });

  it("says so if the connection is lost and can't be restored", async () => {
    const { host, onFailed } = setup();
    host.start();
    await settle();
    FakeRoom.failConnect = new Error("still offline");
    lastRoom().emit(RoomEvent.Disconnected);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onFailed).toHaveBeenCalledWith("Couldn't connect to the live audio service.");
    host.stop();
  });

  it("has nothing to broadcast without a microphone track", async () => {
    const { host, stream, onFailed } = setup();
    stream.tracks.length = 0;
    host.start();
    await settle();
    expect(onFailed).toHaveBeenCalledWith("No microphone audio to broadcast.");
    host.stop();
  });

  it("publishes nothing, and says nothing, if stopped before the connection finished", async () => {
    const { host, onFailed } = setup();
    host.start();
    host.stop(); // before the pass and library have arrived
    await settle();
    expect(FakeRoom.all.every((r) => r.published.length === 0)).toBe(true);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("mutes by silencing the track, leaving the microphone open", () => {
    const { host, stream } = setup();
    host.setMuted(true);
    expect(stream.tracks[0].enabled).toBe(false);
    expect(stream.tracks[0].stopped).toBe(false);
    host.setMuted(false);
    expect(stream.tracks[0].enabled).toBe(true);
  });

  it("stopping leaves the room, turns the microphone off and stops checking in", async () => {
    const { host, stream, api } = setup();
    host.start();
    await settle();
    host.stop();
    expect(lastRoom().disconnected).toBe(true);
    expect(stream.tracks[0].stopped).toBe(true);
    const beats = api.heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.heartbeat.mock.calls.length).toBe(beats);
  });
});

describe("SfuHost: hearing guests on stage", () => {
  it("hands the guests' voices over as one stream, adding and removing them as they come and go", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const onGuestStream = vi.fn();
    const { host } = setup({ onGuestStream });
    host.start();
    await vi.advanceTimersByTimeAsync(0);
    const one = { kind: "audio", mediaStreamTrack: { id: "one" } };
    const two = { kind: "audio", mediaStreamTrack: { id: "two" } };
    lastRoom().emit(RoomEvent.TrackSubscribed, one);
    lastRoom().emit(RoomEvent.TrackSubscribed, two);
    lastRoom().emit(RoomEvent.TrackSubscribed, { kind: "video", mediaStreamTrack: { id: "ignored" } });
    expect(onGuestStream).toHaveBeenCalledTimes(1);
    expect((onGuestStream.mock.calls[0][0] as FakeMediaStream).tracks).toEqual([one.mediaStreamTrack, two.mediaStreamTrack]);
    lastRoom().emit(RoomEvent.TrackUnsubscribed, one);
    expect((onGuestStream.mock.calls[0][0] as FakeMediaStream).tracks).toEqual([two.mediaStreamTrack]);
    host.stop();
    vi.unstubAllGlobals();
  });
});

describe("SfuHost: a connection that drops", () => {
  it("starts over by itself with a fresh pass, keeping the same microphone, and says what is going on", async () => {
    const connection: string[] = [];
    const { host, api, stream, onFailed } = setup({ onConnection: (c) => connection.push(c) });
    host.start();
    await settle();
    const first = lastRoom();
    expect(connection.at(-1)).toBe("live");

    first.emit(RoomEvent.Disconnected);
    expect(connection.at(-1)).toBe("reconnecting");
    expect(first.disconnected).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(FakeRoom.all).toHaveLength(2);
    expect(api.token).toHaveBeenCalledTimes(2);
    expect(lastRoom().published).toEqual([{ track: stream.tracks[0], options: { source: "microphone", name: "microphone" } }]);
    expect(connection.at(-1)).toBe("live");
    expect(onFailed).not.toHaveBeenCalled();
    host.stop();
  });

  it("shows reconnecting while the media client rides out a short drop itself, then live again", async () => {
    const connection: string[] = [];
    const { host } = setup({ onConnection: (c) => connection.push(c) });
    host.start();
    await settle();
    lastRoom().emit(RoomEvent.Reconnecting);
    expect(connection.at(-1)).toBe("reconnecting");
    lastRoom().emit(RoomEvent.Reconnected);
    expect(connection.at(-1)).toBe("live");
    host.stop();
  });

  it("counts a successful reconnection as a fresh start, so a phone that drops now and then is never given up on", async () => {
    const { host, onFailed } = setup({ maxAttempts: 2 });
    host.start();
    await settle();
    for (let i = 0; i < 5; i++) {
      lastRoom().emit(RoomEvent.Disconnected);
      await vi.advanceTimersByTimeAsync(2_000);
    }
    expect(FakeRoom.all).toHaveLength(6);
    expect(onFailed).not.toHaveBeenCalled();
    host.stop();
  });

  it("gives up with a message after repeated failures", async () => {
    const { host, onFailed } = setup({ maxAttempts: 2 });
    host.start();
    await settle();
    FakeRoom.failConnect = new Error("offline");
    lastRoom().emit(RoomEvent.Disconnected);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onFailed).toHaveBeenCalledTimes(1);
    host.stop();
  });

  it("doesn't start over once stopped, and doesn't answer a refusal from the server with retries", async () => {
    const a = setup();
    a.host.start();
    await settle();
    a.host.stop();
    lastRoom().emit(RoomEvent.Disconnected);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeRoom.all).toHaveLength(1);

    FakeRoom.reset();
    const b = setup();
    b.api.token.mockRejectedValue(new ApiError(409, "This live has ended"));
    b.host.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(b.onFailed).toHaveBeenCalledWith("This live has ended");
    expect(b.api.token).toHaveBeenCalledTimes(1);
    b.host.stop();
  });
});

describe("SfuHost: the phone pauses the microphone", () => {
  it("reports the microphone being paused, coming back, and being taken for good", async () => {
    const states: string[] = [];
    const { host, stream } = setup({ onMicrophone: (m) => states.push(m) });
    host.start();
    await settle();
    stream.tracks[0].fire("mute");
    stream.tracks[0].fire("unmute");
    stream.tracks[0].fire("ended");
    expect(states).toEqual(["paused", "ok", "ended"]);
    host.stop();
  });

  it("stops listening for it once stopped", async () => {
    const onMicrophone = vi.fn();
    const { host, stream } = setup({ onMicrophone });
    host.start();
    await settle();
    host.stop();
    stream.tracks[0].fire("mute");
    expect(onMicrophone).not.toHaveBeenCalled();
  });
});

describe("SfuHost: networks that block the direct audio route", () => {
  const relayed = (room: ReturnType<typeof lastRoom>) => (room.connectOptions as { rtcConfig?: { iceTransportPolicy?: string } } | undefined)?.rtcConfig?.iceTransportPolicy === "relay";

  it("connects the usual way first", async () => {
    const { host } = setup();
    host.start();
    await settle();
    expect(relayed(lastRoom())).toBe(false);
    host.stop();
  });

  it("goes through the relay once a connection dies within moments of starting, and stays that way", async () => {
    const { host } = setup();
    host.start();
    await settle();
    lastRoom().emit(RoomEvent.Disconnected); // seconds in: the direct route probably doesn't work here
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeRoom.all).toHaveLength(2);
    expect(relayed(lastRoom())).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000); // a healthy minute later it drops again
    lastRoom().emit(RoomEvent.Disconnected);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeRoom.all).toHaveLength(3);
    expect(relayed(lastRoom())).toBe(true); // doesn't go back to a route that failed
    host.stop();
  });

  it("keeps the usual route when a connection that had been healthy for a while drops", async () => {
    const { host } = setup();
    host.start();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    lastRoom().emit(RoomEvent.Disconnected);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeRoom.all).toHaveLength(2);
    expect(relayed(lastRoom())).toBe(false);
    host.stop();
  });

  it("goes through the relay when the first connection can't even be made", async () => {
    FakeRoom.failConnect = new Error("websocket refused");
    const { host } = setup();
    host.start();
    await settle();
    FakeRoom.failConnect = null;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(FakeRoom.all).toHaveLength(2);
    expect(relayed(FakeRoom.all[0])).toBe(false);
    expect(relayed(FakeRoom.all[1])).toBe(true);
    expect(FakeRoom.all[1].published).toHaveLength(1);
    host.stop();
  });
});

describe("SfuHost: a connection that starts to drop straight away", () => {
  const relayed = (room: ReturnType<typeof lastRoom>) => (room.connectOptions as { rtcConfig?: { iceTransportPolicy?: string } } | undefined)?.rtcConfig?.iceTransportPolicy === "relay";

  it("doesn't wait for the media client to keep trying the blocked route: it starts over through the relay at once", async () => {
    const lines: string[] = [];
    const connection: string[] = [];
    const { host, onFailed } = setup({ onDiagnostic: (l) => lines.push(l), onConnection: (c) => connection.push(c) });
    host.start();
    await settle();
    const first = lastRoom();
    await vi.advanceTimersByTimeAsync(5_000);
    first.emit(RoomEvent.Reconnecting); // seconds in
    expect(first.disconnected).toBe(true);
    expect(lines).toContain("Dropped soon after starting — switching to the relay");
    first.emit(RoomEvent.Disconnected); // what the real client reports when it is disconnected on purpose
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeRoom.all).toHaveLength(2);
    expect(relayed(lastRoom())).toBe(true);
    expect(lastRoom().published).toHaveLength(1);
    expect(connection.at(-1)).toBe("live");
    expect(onFailed).not.toHaveBeenCalled();
    host.stop();
  });

  it("leaves a drop alone once the connection has been healthy for a while", async () => {
    const { host } = setup();
    host.start();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    lastRoom().emit(RoomEvent.Reconnecting);
    expect(lastRoom().disconnected).toBe(false);
    expect(FakeRoom.all).toHaveLength(1);
    host.stop();
  });

  it("only switches once", async () => {
    const { host } = setup();
    host.start();
    await settle();
    lastRoom().emit(RoomEvent.Reconnecting);
    lastRoom().emit(RoomEvent.Disconnected);
    await vi.advanceTimersByTimeAsync(2_000);
    const second = lastRoom();
    second.emit(RoomEvent.Reconnecting); // already on the relay: let the client ride it out
    expect(second.disconnected).toBe(false);
    host.stop();
  });
});

describe("SfuHost: connection details", () => {
  it("puts what happens into plain lines", async () => {
    const lines: string[] = [];
    const { host } = setup({ onDiagnostic: (l) => lines.push(l) });
    host.start();
    await settle();
    await vi.advanceTimersByTimeAsync(31_000); // a connection that has been fine for a while (an early drop would switch to the relay)
    const room = lastRoom();
    room.emit(RoomEvent.SignalConnected);
    room.emit(RoomEvent.ConnectionStateChanged, "connected");
    room.emit(RoomEvent.LocalTrackPublished);
    room.emit(RoomEvent.SignalReconnecting);
    room.emit(RoomEvent.Reconnecting);
    room.emit(RoomEvent.Reconnected);
    room.emit(RoomEvent.ConnectionQualityChanged, "poor");
    room.emit(RoomEvent.MediaDevicesError, new Error("Permission denied"));
    room.emit(RoomEvent.Disconnected, 4);
    expect(lines).toEqual([
      "Connecting to the live audio service (try 1)",
      "Reached the live audio service",
      "Connection: connected",
      "Your microphone is being sent",
      "The connection to the service dropped — reconnecting",
      "Audio connection dropped — reconnecting",
      "Audio connection restored",
      "Connection quality: poor",
      "Microphone problem: Permission denied",
      "Disconnected (reason 4)",
    ]);
    host.stop();
  });

  it("says when it is going through the relay, and why a connection failed", async () => {
    const lines: string[] = [];
    FakeRoom.failConnect = new Error("websocket refused");
    const { host } = setup({ onDiagnostic: (l) => lines.push(l) });
    host.start();
    await settle();
    FakeRoom.failConnect = null;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(lines).toContain("Couldn't connect: websocket refused");
    expect(lines).toContain("Connecting to the live audio service (try 2, through the relay)");
    host.stop();
  });

  it("works without anyone listening in", async () => {
    const { host } = setup();
    host.start();
    await settle();
    expect(() => lastRoom().emit(RoomEvent.Disconnected, 1)).not.toThrow();
    host.stop();
  });
});
