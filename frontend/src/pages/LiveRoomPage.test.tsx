import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LiveRoomPage } from "./LiveRoomPage";
import { liveApi } from "../api/live.api";
import { ApiError } from "../api/client";
import { clearStreamFor, getStreamFor, holdStreamFor } from "../lib/live/hostStream";
import { FakeStream } from "../test/fakeRtc";
import type { ListenerState } from "../lib/live/listener";
import type { LiveRoom, User } from "../types";

// The real host/listener logic is tested on its own; here they're stand-ins we can drive.
const mocks = vi.hoisted(() => ({
  hosts: [] as { opts: Record<string, unknown>; start: () => void; stop: () => void; setMuted: (m: boolean) => void }[],
  listeners: [] as { opts: Record<string, unknown>; start: () => Promise<void>; leave: () => Promise<void>; retry: () => Promise<void> }[],
  listenerStart: undefined as undefined | (() => Promise<void>),
  sfuHosts: [] as { opts: Record<string, unknown>; start: () => void; stop: () => void; setMuted: (m: boolean) => void }[],
  sfuListeners: [] as {
    opts: Record<string, unknown>;
    start: () => Promise<void>;
    leave: () => Promise<void>;
    startSpeaking: ReturnType<typeof vi.fn>;
    setSpeakingMuted: ReturnType<typeof vi.fn>;
    stopSpeaking: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("../lib/live/host", () => ({
  LiveHost: class {
    opts: Record<string, unknown>;
    start = vi.fn();
    stop = vi.fn();
    setMuted = vi.fn();
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      mocks.hosts.push(this);
    }
  },
}));
vi.mock("../lib/live/listener", () => ({
  LiveListener: class {
    opts: Record<string, unknown>;
    start = vi.fn(async () => {
      await mocks.listenerStart?.();
      (this.opts.onJoined as () => void)();
    });
    leave = vi.fn(async () => {});
    retry = vi.fn(async () => {});
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      mocks.listeners.push(this);
    }
  },
}));
vi.mock("../lib/live/sfuHost", () => ({
  SfuHost: class {
    opts: Record<string, unknown>;
    start = vi.fn();
    stop = vi.fn();
    setMuted = vi.fn();
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      mocks.sfuHosts.push(this);
    }
  },
}));
vi.mock("../lib/live/sfuListener", () => ({
  SfuListener: class {
    opts: Record<string, unknown>;
    start = vi.fn(async () => {
      (this.opts.onJoined as () => void)();
    });
    leave = vi.fn(async () => {});
    retry = vi.fn(async () => {});
    startSpeaking = vi.fn(async () => {});
    setSpeakingMuted = vi.fn(async () => {});
    stopSpeaking = vi.fn(async () => {});
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      mocks.sfuListeners.push(this);
    }
  },
}));
const wake = vi.hoisted(() => ({ kept: vi.fn(), released: vi.fn() }));
vi.mock("../lib/wakeLock", () => ({
  keepScreenOn: () => {
    wake.kept();
    return wake.released;
  },
}));
vi.mock("../components/live/LiveChat", () => ({
  LiveChat: ({ open, isHost, pollMs }: { open: boolean; isHost: boolean; pollMs?: number }) => (
    <div data-poll={pollMs}>
      chat {open ? "open" : "closed"}
      {isHost ? " (host)" : ""}
    </div>
  ),
}));
vi.mock("../api/live.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/live.api")>()),
  liveApi: { get: vi.fn(), end: vi.fn(), stage: vi.fn(), requestToSpeak: vi.fn(), leaveStage: vi.fn(), acceptInvite: vi.fn(), inviteGuest: vi.fn(), removeGuest: vi.fn() },
}));
const api = vi.mocked(liveApi);

const hostUser = { id: "h1", username: "dj", displayName: "DJ Kai", avatarUrl: null } as User;
const room = (over: Partial<LiveRoom> = {}): LiveRoom => ({
  id: "l1",
  title: "Beats and chill",
  status: "live",
  startedAt: new Date().toISOString(),
  host: hostUser,
  isHost: false,
  listenerCount: 2,
  maxListeners: 8,
  ...over,
});

const getUserMedia = vi.fn();
const play = vi.fn();

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/live/l1"]}>
      <Routes>
        <Route path="/live" element={<div>Live list page</div>} />
        <Route path="/live/:id" element={<LiveRoomPage />} />
      </Routes>
    </MemoryRouter>
  );
}
const hostStarted = () => waitFor(() => expect(mocks.hosts).toHaveLength(1));
const lastListener = () => mocks.listeners[mocks.listeners.length - 1];
const setState = (s: ListenerState) => act(() => (lastListener().opts.onState as (s: ListenerState) => void)(s));

beforeEach(() => {
  wake.kept.mockClear();
  wake.released.mockClear();
  mocks.hosts.length = 0;
  mocks.listeners.length = 0;
  mocks.sfuHosts.length = 0;
  mocks.sfuListeners.length = 0;
  mocks.listenerStart = undefined;
  Object.values(api).forEach((fn) => fn.mockReset());
  api.end.mockResolvedValue(undefined);
  clearStreamFor("l1");
  getUserMedia.mockReset();
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  vi.stubGlobal("RTCPeerConnection", class {});
  play.mockReset();
  play.mockResolvedValue(undefined);
  HTMLMediaElement.prototype.play = play;
  window.confirm = vi.fn(() => true);
});
afterEach(async () => {
  // Leaving a host page schedules a short delayed teardown; let it run now so it can't land in the next test.
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 200));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LiveRoomPage: the room itself", () => {
  it("shows a message for a live that doesn't exist or can't be seen", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Live not found"));
    renderRoom();
    expect(await screen.findByText("This live isn't available.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to live" })).toHaveAttribute("href", "/live");
  });

  it("shows a generic message when it can't be loaded", async () => {
    api.get.mockRejectedValue(new TypeError("offline"));
    renderRoom();
    expect(await screen.findByText("Couldn't load this live.")).toBeInTheDocument();
  });
});

describe("LiveRoomPage: as a listener", () => {
  beforeEach(() => api.get.mockResolvedValue({ live: room() }));

  it("shows the host, title and listener count, and waits for a tap before joining", async () => {
    renderRoom();
    expect(await screen.findByRole("heading", { name: "Beats and chill" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DJ Kai" })).toHaveAttribute("href", "/u/dj");
    expect(screen.getByText("2 listening")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listen" })).toBeEnabled();
    expect(mocks.listeners).toHaveLength(0); // nothing joined yet
    expect(screen.getByText("chat closed")).toBeInTheDocument();
  });

  it("joins when Listen is tapped, opens the chat once admitted, and shows the connection's progress", async () => {
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    expect(lastListener().opts).toMatchObject({ liveId: "l1", hostId: "h1" });
    expect(lastListener().start).toHaveBeenCalled();
    expect(await screen.findByText("chat open")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Connecting…");
    await setState("live");
    expect(screen.getByRole("status")).toHaveTextContent("Listening live");
    await setState("reconnecting");
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…");
  });

  it("keeps the chat closed until the server has actually let us in", async () => {
    let admit!: () => void;
    mocks.listenerStart = () => new Promise<void>((resolve) => (admit = resolve));
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    expect(screen.getByText("chat closed")).toBeInTheDocument();
    await act(async () => admit());
    expect(await screen.findByText("chat open")).toBeInTheDocument();
  });

  it("plays the incoming audio, and offers a tap if the browser blocks autoplay", async () => {
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    const stream = new FakeStream().asStream();
    play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    act(() => (lastListener().opts.onStream as (s: MediaStream) => void)(stream));
    expect(document.querySelector("audio")!.srcObject).toBe(stream);
    const tap = await screen.findByRole("button", { name: "Tap to play audio" });
    await userEvent.click(tap);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tap to play audio" })).not.toBeInTheDocument());
  });

  it("mutes and unmutes just for this listener", async () => {
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    const audio = document.querySelector("audio")!;
    await userEvent.click(await screen.findByRole("button", { name: "Mute" }));
    expect(audio.muted).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(audio.muted).toBe(false);
  });

  it("offers Try again when the audio can't connect", async () => {
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    await setState("failed");
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn.t connect the audio/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(lastListener().retry).toHaveBeenCalled();
  });

  it("shows when the live ends while listening, and drops the chat", async () => {
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    await setState("ended");
    expect(screen.getByRole("status")).toHaveTextContent("This live has ended.");
    expect(screen.queryByText(/^chat/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
  });

  it("shows the server's reason when joining is refused (e.g. full) and lets them try again", async () => {
    mocks.listenerStart = async () => {
      throw new ApiError(409, "This live is full (8 listeners)");
    };
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    expect(await screen.findByText("This live is full (8 listeners)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listen" })).toBeEnabled();
    expect(screen.getByText("chat closed")).toBeInTheDocument();
  });

  it("leaves and goes back to the list", async () => {
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    const listener = lastListener();
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    expect(listener.leave).toHaveBeenCalled();
    expect(await screen.findByText("Live list page")).toBeInTheDocument();
  });

  it("leaves the room when the page is closed", async () => {
    const { unmount } = renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    const listener = lastListener();
    unmount();
    expect(listener.leave).toHaveBeenCalled();
  });

  it("disables Listen when the room is full", async () => {
    api.get.mockResolvedValue({ live: room({ listenerCount: 8 }) });
    renderRoom();
    expect(await screen.findByRole("button", { name: "This live is full" })).toBeDisabled();
  });

  it("shows an ended live as ended, with no way to listen", async () => {
    api.get.mockResolvedValue({ live: room({ status: "ended" }) });
    renderRoom();
    expect(await screen.findByText("This live has ended.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Listen" })).not.toBeInTheDocument();
  });

  it("says so on a browser without live audio, and doesn't join", async () => {
    vi.stubGlobal("RTCPeerConnection", undefined);
    renderRoom();
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't play live audio/);
    expect(screen.getByRole("button", { name: "Listen" })).toBeDisabled();
    expect(mocks.listeners).toHaveLength(0);
  });
});

describe("LiveRoomPage: as the host", () => {
  beforeEach(() => api.get.mockResolvedValue({ live: room({ isHost: true }) }));

  it("starts broadcasting with the microphone handed over from the Go live button", async () => {
    const stream = new FakeStream();
    holdStreamFor("l1", stream.asStream());
    renderRoom();
    expect(await screen.findByText("You're live — listeners can hear your microphone.")).toBeInTheDocument();
    await hostStarted();
    expect(mocks.hosts[0].opts).toMatchObject({ liveId: "l1", stream });
    expect(mocks.hosts[0].start).toHaveBeenCalled();
    expect(screen.getByText("chat open (host)")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("updates the listener count as the broadcast reports it", async () => {
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await screen.findByText(/You're live/);
    await hostStarted();
    act(() => (mocks.hosts[0].opts.onListenerCount as (n: number) => void)(5));
    expect(screen.getByText("5 listening")).toBeInTheDocument();
  });

  it("mutes and unmutes the broadcast", async () => {
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Mute microphone" }));
    await hostStarted();
    expect(mocks.hosts[0].setMuted).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(/microphone is muted/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unmute microphone" }));
    expect(mocks.hosts[0].setMuted).toHaveBeenLastCalledWith(false);
  });

  it("ends the live after confirming, and goes back to the list", async () => {
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await hostStarted();
    await userEvent.click(await screen.findByRole("button", { name: "End live" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.hosts[0].stop).toHaveBeenCalled();
    expect(api.end).toHaveBeenCalledWith("l1");
    expect(await screen.findByText("Live list page")).toBeInTheDocument();
    expect(getStreamFor("l1")).toBeNull();
  });

  it("doesn't end it if the confirmation is declined", async () => {
    window.confirm = vi.fn(() => false);
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await hostStarted();
    await userEvent.click(await screen.findByRole("button", { name: "End live" }));
    expect(mocks.hosts[0].stop).not.toHaveBeenCalled();
    expect(api.end).not.toHaveBeenCalled();
  });

  it("shows 'ended' if the broadcast reports the live is over", async () => {
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await screen.findByText(/You're live/);
    await hostStarted();
    act(() => (mocks.hosts[0].opts.onEnded as () => void)());
    expect(await screen.findByText("Your live has ended.")).toBeInTheDocument();
  });

  it("ends the live and the broadcast when the host leaves the page (so the microphone can't stay on unseen)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    holdStreamFor("l1", new FakeStream().asStream());
    const { unmount } = renderRoom();
    await screen.findByText(/You're live/);
    await hostStarted();
    unmount();
    expect(mocks.hosts[0].stop).not.toHaveBeenCalled(); // not instantly (React may re-run effects in development)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(mocks.hosts[0].stop).toHaveBeenCalled();
    expect(api.end).toHaveBeenCalledWith("l1");
  });

  it("asks for the microphone again after a page reload, since the stream doesn't survive one", async () => {
    getUserMedia.mockResolvedValue(new FakeStream());
    renderRoom();
    expect(await screen.findByText(/microphone isn.t on/)).toBeInTheDocument();
    expect(mocks.hosts).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Allow microphone" }));
    expect(await screen.findByText("You're live — listeners can hear your microphone.")).toBeInTheDocument();
    await hostStarted();
  });

  it("explains a blocked microphone on resume", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Microphone access was blocked/);
    expect(mocks.hosts).toHaveLength(0);
  });

  it("shows an already-ended live of the host's as ended", async () => {
    api.get.mockResolvedValue({ live: room({ isHost: true, status: "ended" }) });
    renderRoom();
    expect(await screen.findByText("Your live has ended.")).toBeInTheDocument();
    expect(mocks.hosts).toHaveLength(0);
  });
});

describe("LiveRoomPage: big lives (through a media server)", () => {
  const big = (over: Partial<LiveRoom> = {}) => room({ mode: "sfu", maxListeners: 50, heartbeatMs: 20_000, commentPollMs: 6_000, ...over });

  it("listens through the media-server client, at the pace the room asks for, and not through browser-to-browser", async () => {
    api.get.mockResolvedValue({ live: big() });
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    expect(mocks.sfuListeners).toHaveLength(1);
    expect(mocks.listeners).toHaveLength(0);
    expect(mocks.sfuListeners[0].opts).toMatchObject({ liveId: "l1", hostId: "h1", heartbeatMs: 20_000 });
    expect(await screen.findByText("chat open")).toBeInTheDocument();
  });

  it("passes the room's chat pace to the chat", async () => {
    api.get.mockResolvedValue({ live: big() });
    renderRoom();
    expect((await screen.findByText(/chat closed/)).getAttribute("data-poll")).toBe("6000");
  });

  it("broadcasts through the media-server client as the host", async () => {
    api.get.mockResolvedValue({ live: big({ isHost: true }) });
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await screen.findByText(/You're live/);
    await waitFor(() => expect(mocks.sfuHosts).toHaveLength(1));
    expect(mocks.hosts).toHaveLength(0);
    expect(mocks.sfuHosts[0].opts).toMatchObject({ liveId: "l1", heartbeatMs: 20_000 });
    expect(mocks.sfuHosts[0].start).toHaveBeenCalled();
    expect(screen.getByText("Up to 50 people can listen.", { exact: false })).toBeInTheDocument();
  });

  it("tells the host plainly if the connection to the audio service fails", async () => {
    api.get.mockResolvedValue({ live: big({ isHost: true }) });
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await waitFor(() => expect(mocks.sfuHosts).toHaveLength(1));
    act(() => (mocks.sfuHosts[0].opts.onFailed as (m: string) => void)("Couldn't connect to the live audio service."));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't connect to the live audio service. Listeners can't hear you");
    expect(screen.getByRole("button", { name: "End live" })).toBeInTheDocument();
  });

  it("shows the host's end when the media-server broadcast reports the live is over", async () => {
    api.get.mockResolvedValue({ live: big({ isHost: true }) });
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await waitFor(() => expect(mocks.sfuHosts).toHaveLength(1));
    act(() => (mocks.sfuHosts[0].opts.onEnded as () => void)());
    expect(await screen.findByText("Your live has ended.")).toBeInTheDocument();
  });

  it("a small live (no mode, or browser-to-browser) never touches the media-server client", async () => {
    api.get.mockResolvedValue({ live: room() });
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    expect(mocks.listeners).toHaveLength(1);
    expect(mocks.sfuListeners).toHaveLength(0);
  });
});

describe("LiveRoomPage: the stage in big lives", () => {
  const big = (over: Partial<LiveRoom> = {}) => room({ mode: "sfu", maxListeners: 50, maxGuests: 9, heartbeatMs: 20_000, commentPollMs: 6_000, ...over });
  const lena = { id: "u1", username: "lena", displayName: "Lena", avatarUrl: null } as User;
  const stageOf = (over: Record<string, unknown> = {}) => ({ enabled: true, maxGuests: 9, me: "listener", guests: [], ...over }) as never;

  async function listenAndJoin() {
    api.get.mockResolvedValue({ live: big() });
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    await waitFor(() => expect(mocks.sfuListeners).toHaveLength(1));
  }

  it("shows the host their stage: who is listening and who is asking", async () => {
    api.get.mockResolvedValue({ live: big({ isHost: true }) });
    api.stage.mockResolvedValue(stageOf({ me: null, requests: [{ user: lena }], invited: [], listeners: [], guests: [] }));
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    expect(await screen.findByRole("region", { name: "Guests on stage" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Invite Lena to speak" }));
    expect(api.inviteGuest).toHaveBeenCalledWith("l1", "u1");
  });

  it("plays the guests' voices for the host, and offers a tap if the browser blocks it", async () => {
    api.get.mockResolvedValue({ live: big({ isHost: true }) });
    api.stage.mockResolvedValue(stageOf({ me: null, requests: [], invited: [], listeners: [], guests: [] }));
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await waitFor(() => expect(mocks.sfuHosts).toHaveLength(1));
    play.mockRejectedValueOnce(new Error("blocked"));
    const guests = { id: "guest-stream" } as unknown as MediaStream;
    act(() => (mocks.sfuHosts[0].opts.onGuestStream as (s: MediaStream) => void)(guests));
    const tap = await screen.findByRole("button", { name: "Tap to hear your guests" });
    expect(document.querySelector("audio")?.srcObject).toBe(guests);
    await userEvent.click(tap);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tap to hear your guests" })).not.toBeInTheDocument());
  });

  it("shows no stage for a small live", async () => {
    api.get.mockResolvedValue({ live: room({ isHost: true }) });
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await hostStarted();
    expect(api.stage).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Guests on stage" })).not.toBeInTheDocument();
  });

  it("lets a listener ask to speak, only once they are in the room", async () => {
    api.get.mockResolvedValue({ live: big() });
    api.stage.mockResolvedValue(stageOf());
    api.requestToSpeak.mockResolvedValue({ stage: "requested" });
    renderRoom();
    await screen.findByRole("button", { name: "Listen" });
    expect(api.stage).not.toHaveBeenCalled(); // not asked before joining
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    api.stage.mockResolvedValue(stageOf({ me: "listener" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ask to speak" }));
    expect(api.requestToSpeak).toHaveBeenCalledWith("l1");
  });

  it("puts an invited listener on stage and starts their microphone when they accept", async () => {
    api.stage.mockResolvedValue(stageOf({ me: "invited" }));
    api.acceptInvite.mockResolvedValue({ stage: "speaking" });
    await listenAndJoin();
    api.stage.mockResolvedValue(stageOf({ me: "speaking", guests: [{ user: lena }] }));
    await userEvent.click(await screen.findByRole("button", { name: "Join the stage" }));
    expect(api.acceptInvite).toHaveBeenCalledWith("l1");
    await waitFor(() => expect(mocks.sfuListeners[0].startSpeaking).toHaveBeenCalled());
    expect(await screen.findByText(/everyone can hear you/)).toBeInTheDocument();
    // and they can mute themselves
    await userEvent.click(screen.getByRole("button", { name: "Mute my microphone" }));
    expect(mocks.sfuListeners[0].setSpeakingMuted).toHaveBeenCalledWith(true);
  });

  it("tells them what went wrong if the microphone can't start, and lets them try again", async () => {
    api.stage.mockResolvedValue(stageOf({ me: "invited" }));
    api.acceptInvite.mockResolvedValue({ stage: "speaking" });
    await listenAndJoin();
    mocks.sfuListeners[0].startSpeaking.mockRejectedValueOnce(new Error("Microphone access was blocked."));
    api.stage.mockResolvedValue(stageOf({ me: "speaking" }));
    await userEvent.click(await screen.findByRole("button", { name: "Join the stage" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone access was blocked.");
    await userEvent.click(await screen.findByRole("button", { name: "Turn on microphone" }));
    await waitFor(() => expect(mocks.sfuListeners[0].startSpeaking).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/everyone can hear you/)).toBeInTheDocument();
  });

  it("stops the microphone when the guest steps down", async () => {
    api.stage.mockResolvedValue(stageOf({ me: "invited" }));
    api.acceptInvite.mockResolvedValue({ stage: "speaking" });
    api.leaveStage.mockResolvedValue({ stage: "listener" });
    await listenAndJoin();
    api.stage.mockResolvedValue(stageOf({ me: "speaking" }));
    await userEvent.click(await screen.findByRole("button", { name: "Join the stage" }));
    await screen.findByText(/everyone can hear you/);
    api.stage.mockResolvedValue(stageOf({ me: "listener" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave the stage" }));
    expect(api.leaveStage).toHaveBeenCalledWith("l1");
    await waitFor(() => expect(mocks.sfuListeners[0].stopSpeaking).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Ask to speak" })).toBeInTheDocument();
  });

  it("stops the microphone, and says why, when the host sends the guest back to listening", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.stage.mockResolvedValue(stageOf({ me: "invited" }));
    api.acceptInvite.mockResolvedValue({ stage: "speaking" });
    await listenAndJoin();
    api.stage.mockResolvedValue(stageOf({ me: "speaking" }));
    await user.click(await screen.findByRole("button", { name: "Join the stage" }));
    await screen.findByText(/everyone can hear you/);

    api.stage.mockResolvedValue(stageOf({ me: "listener" })); // the host removed them
    await act(() => vi.advanceTimersByTimeAsync(4_500));
    await waitFor(() => expect(mocks.sfuListeners[0].stopSpeaking).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent("The host moved you back to listening.");
    expect(screen.getByRole("button", { name: "Ask to speak" })).toBeInTheDocument();
  });

  it("shows the server's reason if the request is refused", async () => {
    api.stage.mockResolvedValue(stageOf());
    api.requestToSpeak.mockRejectedValue(new ApiError(409, "Lots of people are asking to speak right now — try again in a moment."));
    await listenAndJoin();
    await userEvent.click(await screen.findByRole("button", { name: "Ask to speak" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Lots of people are asking");
  });

  it("shows a small live's listener nothing about speaking", async () => {
    api.get.mockResolvedValue({ live: room() });
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    await screen.findByText("chat open");
    expect(api.stage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Ask to speak" })).not.toBeInTheDocument();
  });
});

describe("LiveRoomPage: a host on a phone", () => {
  const big = (over: Partial<LiveRoom> = {}) => room({ mode: "sfu", isHost: true, maxListeners: 50, heartbeatMs: 20_000, commentPollMs: 6_000, ...over });
  const start = async () => {
    api.get.mockResolvedValue({ live: big() });
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await waitFor(() => expect(mocks.sfuHosts).toHaveLength(1));
    await screen.findByText(/You're live/);
    return mocks.sfuHosts[0].opts as { onConnection: (s: string) => void; onMicrophone: (s: string) => void; onFailed: (m: string) => void };
  };

  it("keeps the screen on while live, and lets it go when the live is left", async () => {
    await start();
    expect(wake.kept).toHaveBeenCalledTimes(1);
    cleanup();
    expect(wake.released).toHaveBeenCalled();
  });

  it("doesn't hold the screen when there is no microphone yet", async () => {
    api.get.mockResolvedValue({ live: big() });
    renderRoom();
    await screen.findByText(/Allow microphone/);
    expect(wake.kept).not.toHaveBeenCalled();
  });

  it("says the connection dropped and is being restored, then clears the message", async () => {
    const opts = await start();
    act(() => opts.onConnection("reconnecting"));
    expect(await screen.findByText(/Your connection dropped — reconnecting/)).toBeInTheDocument();
    act(() => opts.onConnection("live"));
    await waitFor(() => expect(screen.queryByText(/Your connection dropped/)).not.toBeInTheDocument());
  });

  it("warns when the phone pauses the microphone, and clears it when it comes back", async () => {
    const opts = await start();
    act(() => opts.onMicrophone("paused"));
    expect(await screen.findByRole("alert")).toHaveTextContent("paused the microphone");
    expect(screen.getByRole("alert")).toHaveTextContent("screen on");
    act(() => opts.onMicrophone("ok"));
    await waitFor(() => expect(screen.queryByText(/paused the microphone/)).not.toBeInTheDocument());
  });

  it("says plainly when the phone has taken the microphone for good", async () => {
    const opts = await start();
    act(() => opts.onMicrophone("ended"));
    expect(await screen.findByRole("alert")).toHaveTextContent("stopped the microphone");
  });

  it("shows only the final failure, not a reconnecting notice beside it, once it has given up", async () => {
    const opts = await start();
    act(() => opts.onConnection("reconnecting"));
    act(() => opts.onFailed("The connection to the live audio service was lost."));
    expect(await screen.findByRole("alert")).toHaveTextContent("The connection to the live audio service was lost.");
    expect(screen.queryByText(/Your connection dropped/)).not.toBeInTheDocument();
  });
});

describe("LiveRoomPage: connection details for a host", () => {
  const big = () => room({ mode: "sfu", isHost: true, maxListeners: 50, heartbeatMs: 20_000, commentPollMs: 6_000 });
  const start = async () => {
    api.get.mockResolvedValue({ live: big() });
    holdStreamFor("l1", new FakeStream().asStream());
    renderRoom();
    await waitFor(() => expect(mocks.sfuHosts).toHaveLength(1));
    await screen.findByText(/You're live/);
    return mocks.sfuHosts[0].opts as { onDiagnostic: (l: string) => void; onConnection: (s: string) => void };
  };

  it("collects what the connection reports, folded away while all is well", async () => {
    const opts = await start();
    act(() => opts.onDiagnostic("Reached the live audio service"));
    const panel = screen.getByText("Connection details").closest("details")!;
    expect(panel).not.toHaveAttribute("open");
    expect(screen.getByText(/Reached the live audio service/)).toBeInTheDocument();
    expect(screen.getByText(/Reached the live audio service/).textContent).toMatch(/^\+\d+s {2}/);
  });

  it("opens by itself when the connection drops", async () => {
    const opts = await start();
    act(() => opts.onConnection("reconnecting"));
    await waitFor(() => expect(screen.getByText("Connection details").closest("details")).toHaveAttribute("open"));
  });

  it("says when the phone itself has lost its internet (not the live audio service), and when it is back", async () => {
    await start();
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(await screen.findByText(/Your phone has lost its internet connection/)).toBeInTheDocument();
    expect(screen.getByText(/Your phone says it lost its internet connection/)).toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.queryByText(/Your phone has lost its internet connection/)).not.toBeInTheDocument());
    expect(screen.getByText(/Your phone is back online/)).toBeInTheDocument();
  });

  it("shows the service message, not the phone one, when only the service dropped", async () => {
    const opts = await start();
    act(() => opts.onConnection("reconnecting"));
    expect(await screen.findByText(/Your connection dropped — reconnecting/)).toBeInTheDocument();
    expect(screen.queryByText(/Your phone has lost its internet connection/)).not.toBeInTheDocument();
  });
});
