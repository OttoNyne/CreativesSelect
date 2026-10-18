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

describe("SfuListener: guests on stage", () => {
  const voice = (id: string) => ({ kind: "audio", mediaStreamTrack: { id } });

  it("plays the host and every guest through one stream, handed over once", async () => {
    const { listener, onStream } = setup();
    await listener.start();
    const host = voice("host");
    const guest = voice("guest");
    lastRoom().emit(RoomEvent.TrackSubscribed, host);
    lastRoom().emit(RoomEvent.TrackSubscribed, guest);
    expect(onStream).toHaveBeenCalledTimes(1);
    expect((onStream.mock.calls[0][0] as FakeMediaStream).tracks).toEqual([host.mediaStreamTrack, guest.mediaStreamTrack]);
    await listener.leave();
  });

  it("takes a voice out of the stream when it leaves", async () => {
    const { listener, onStream } = setup();
    await listener.start();
    const host = voice("host");
    const guest = voice("guest");
    lastRoom().emit(RoomEvent.TrackSubscribed, host);
    lastRoom().emit(RoomEvent.TrackSubscribed, guest);
    lastRoom().emit(RoomEvent.TrackUnsubscribed, guest);
    expect((onStream.mock.calls[0][0] as FakeMediaStream).tracks).toEqual([host.mediaStreamTrack]);
    await listener.leave();
  });

  it("hands over a fresh stream after reconnecting to a new room", async () => {
    const { listener, onStream } = setup();
    await listener.start();
    lastRoom().emit(RoomEvent.TrackSubscribed, voice("host"));
    lastRoom().emit(RoomEvent.Disconnected);
    await settle();
    lastRoom().emit(RoomEvent.TrackSubscribed, voice("host-again"));
    expect(onStream).toHaveBeenCalledTimes(2);
    expect(onStream.mock.calls[1][0]).not.toBe(onStream.mock.calls[0][0]);
    await listener.leave();
  });

  it("turns the microphone on once the server has let it through", async () => {
    const { listener } = setup();
    await listener.start();
    const participant = lastRoom().localParticipant;
    const started = listener.startSpeaking();
    await vi.advanceTimersByTimeAsync(300); // still waiting: the server hasn't answered yet
    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled();
    participant.permissions = { canPublish: true };
    await vi.advanceTimersByTimeAsync(200);
    await started;
    expect(participant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(participant.microphoneEnabled).toBe(true);
    await listener.leave();
  });

  it("says so if the microphone is never let through", async () => {
    const { listener } = setup();
    await listener.start();
    const started = listener.startSpeaking();
    const outcome = expect(started).rejects.toThrow("hasn't let your microphone through");
    await vi.advanceTimersByTimeAsync(7_000);
    await outcome;
    expect(lastRoom().localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    await listener.leave();
  });

  it("explains a blocked microphone in words a person can act on", async () => {
    const { listener } = setup();
    await listener.start();
    lastRoom().localParticipant.permissions = { canPublish: true };
    FakeRoom.failMicrophone = new DOMException("denied", "NotAllowedError");
    await expect(listener.startSpeaking()).rejects.toThrow("Microphone access was blocked");
    await listener.leave();
  });

  it("can't speak before it is connected", async () => {
    const { listener } = setup();
    await expect(listener.startSpeaking()).rejects.toThrow("not connected");
  });

  it("mutes, unmutes and stops the microphone", async () => {
    const { listener } = setup();
    await listener.start();
    const participant = lastRoom().localParticipant;
    await listener.setSpeakingMuted(true);
    expect(participant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    await listener.setSpeakingMuted(false);
    expect(participant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    await listener.stopSpeaking();
    expect(participant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    await listener.leave();
  });
});

describe("SfuListener: networks that block the direct audio route (a phone on mobile data)", () => {
  const RELAY = { rtcConfig: { iceTransportPolicy: "relay" } };

  it("connects directly at first, and through the relay from the start when asked to", async () => {
    const direct = setup();
    await direct.listener.start();
    expect(lastRoom().connectOptions).toBeUndefined();
    await direct.listener.leave();
    FakeRoom.reset();
    const phone = setup({ startWithRelay: true });
    await phone.listener.start();
    expect(lastRoom().connectOptions).toEqual(RELAY);
    await phone.listener.leave();
  });

  it("starts over through the relay when the connection drops soon after starting", async () => {
    const { listener, states } = setup();
    await listener.start();
    const first = lastRoom();
    await vi.advanceTimersByTimeAsync(5_000);
    first.emit(RoomEvent.Reconnecting);
    expect(states.at(-1)).toBe("reconnecting");
    expect(first.disconnected).toBe(true);
    first.emit(RoomEvent.Disconnected); // closing the room says so, which hands over to a new connection
    await settle();
    expect(FakeRoom.all).toHaveLength(2);
    expect(lastRoom().connectOptions).toEqual(RELAY);
    await listener.leave();
  });

  it("leaves a connection that has been fine for a while to ride out a drop by itself", async () => {
    const { listener, states } = setup();
    await listener.start();
    const first = lastRoom();
    first.emit(RoomEvent.TrackSubscribed, audioTrack);
    await vi.advanceTimersByTimeAsync(40_000);
    first.emit(RoomEvent.Reconnecting);
    expect(states.at(-1)).toBe("reconnecting");
    expect(first.disconnected).toBe(false);
    first.emit(RoomEvent.Reconnected);
    expect(states.at(-1)).toBe("live");
    await listener.leave();
  });

  it("tries the relay when it couldn't connect at all", async () => {
    const { listener } = setup();
    FakeRoom.failConnect = new Error("ice failed");
    await listener.start();
    await settle();
    expect(FakeRoom.all.length).toBeGreaterThanOrEqual(2);
    expect(FakeRoom.all[0].connect).toHaveBeenCalledWith("wss://demo.livekit.cloud", "listener-token", undefined);
    expect(FakeRoom.all[1].connect).toHaveBeenCalledWith("wss://demo.livekit.cloud", "listener-token", RELAY);
    await listener.leave();
  });

  it("tries again by itself when the phone's network comes back, but only after giving up, and not after leaving", async () => {
    const { listener, states } = setup();
    await listener.start();
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(FakeRoom.all).toHaveLength(1); // nothing was wrong
    for (let i = 0; i < 3; i++) {
      lastRoom().emit(RoomEvent.Disconnected);
      await settle();
    }
    expect(states.at(-1)).toBe("failed");
    const before = FakeRoom.all.length;
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(FakeRoom.all.length).toBe(before + 1);
    expect(states.at(-1)).toBe("connecting"); // a fresh try, as when the person taps Try again
    await listener.leave();
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(FakeRoom.all.length).toBe(before + 1);
  });
});

describe("SfuListener: a guest on stage whose connection is rebuilt", () => {
  async function speaking(overrides: Partial<ConstructorParameters<typeof SfuListener>[0]> = {}) {
    const made = setup(overrides);
    await made.listener.start();
    lastRoom().localParticipant.permissions = { canPublish: true };
    await made.listener.startSpeaking();
    return made;
  }

  it("turns the microphone back on in the new connection, as it was", async () => {
    const { listener } = await speaking();
    await listener.setSpeakingMuted(true);
    lastRoom().emit(RoomEvent.Disconnected);
    await settle();
    const rebuilt = lastRoom();
    expect(FakeRoom.all).toHaveLength(2);
    rebuilt.localParticipant.permissions = { canPublish: true };
    await vi.advanceTimersByTimeAsync(300);
    // on again, then back to muted, because that is how the guest had left it
    expect(rebuilt.localParticipant.setMicrophoneEnabled.mock.calls.map((c) => c[0])).toEqual([true, false]);
    await listener.leave();
  });

  it("tells the page when the microphone can't be put back, instead of carrying on in silence", async () => {
    const onSpeakingLost = vi.fn();
    const { listener } = await speaking({ onSpeakingLost });
    lastRoom().emit(RoomEvent.Disconnected);
    await settle();
    await vi.advanceTimersByTimeAsync(7_000); // the new connection never lets the microphone through
    expect(onSpeakingLost).toHaveBeenCalledWith(expect.stringContaining("hasn't let your microphone through"));
    await listener.leave();
  });

  it("does nothing about the microphone for someone who was only listening, or who stepped down", async () => {
    const onSpeakingLost = vi.fn();
    const { listener } = await speaking({ onSpeakingLost });
    await listener.stopSpeaking();
    lastRoom().emit(RoomEvent.Disconnected);
    await settle();
    await vi.advanceTimersByTimeAsync(7_000);
    expect(lastRoom().localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(onSpeakingLost).not.toHaveBeenCalled();
    await listener.leave();
  });
});
