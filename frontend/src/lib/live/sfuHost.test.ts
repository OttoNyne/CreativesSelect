import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SfuHost } from "./sfuHost";
import { ApiError } from "../../api/client";
import { FakeStream } from "../../test/fakeRtc";
import { FakeRoom, RoomEvent, fakeLiveKit, lastRoom } from "../../test/fakeLiveKit";

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

    FakeRoom.failConnect = new Error("websocket refused");
    const b = setup();
    b.host.start();
    await settle();
    expect(b.onFailed).toHaveBeenCalledWith("Couldn't connect to the live audio service.");
    b.host.stop();
  });

  it("says so if the connection is lost for good", async () => {
    const { host, onFailed } = setup();
    host.start();
    await settle();
    lastRoom().emit(RoomEvent.Disconnected);
    expect(onFailed).toHaveBeenCalledWith("The connection to the live audio service was lost.");
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
