import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LivePage } from "./LivePage";
import { liveApi } from "../api/live.api";
import { scheduledApi } from "../api/scheduled.api";
import { ApiError } from "../api/client";
import { getStreamFor } from "../lib/live/hostStream";
import { FakeStream } from "../test/fakeRtc";
import type { LiveRoom, ScheduledLive, User } from "../types";

vi.mock("../api/live.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/live.api")>()),
  liveApi: { list: vi.fn(), start: vi.fn() },
}));
vi.mock("../api/scheduled.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/scheduled.api")>()),
  scheduledApi: { list: vi.fn(async () => ({ scheduled: [] })), create: vi.fn(), cancel: vi.fn(), remind: vi.fn(), unremind: vi.fn() },
}));
const api = vi.mocked(liveApi);

const host = { id: "h1", username: "dj", displayName: "DJ Kai", avatarUrl: null } as User;
const room = (over: Partial<LiveRoom> = {}): LiveRoom => ({
  id: "l1",
  title: "Beats and chill",
  status: "live",
  startedAt: new Date().toISOString(),
  host,
  isHost: false,
  listenerCount: 3,
  maxListeners: 8,
  ...over,
});

const getUserMedia = vi.fn();

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/live"]}>
      <Routes>
        <Route path="/live" element={<LivePage />} />
        <Route path="/live/:id" element={<div>Room {location.pathname}</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.list.mockResolvedValue({ lives: [room()] });
  getUserMedia.mockReset();
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  vi.stubGlobal("RTCPeerConnection", class {});
});
afterEach(() => vi.unstubAllGlobals());

describe("LivePage: who's live", () => {
  it("lists the lives with host, title and how many are listening", async () => {
    renderPage();
    const card = await screen.findByRole("link", { name: /Beats and chill/ });
    expect(card).toHaveAttribute("href", "/live/l1");
    expect(card).toHaveTextContent("DJ Kai · 3 listening");
    expect(card).toHaveTextContent("Live");
  });

  it("calls your own live 'You'", async () => {
    api.list.mockResolvedValue({ lives: [room({ isHost: true })] });
    renderPage();
    expect(await screen.findByRole("link", { name: /Beats and chill/ })).toHaveTextContent("You · 3 listening");
  });

  it("tells people how many can listen, as the server says a live started now would allow", async () => {
    api.list.mockResolvedValue({ lives: [], config: { mode: "sfu", maxListeners: 50 } });
    renderPage();
    expect(await screen.findByText(/Up to 50 people can listen at once/)).toBeInTheDocument();
  });

  it("doesn't guess a number before it knows", async () => {
    api.list.mockResolvedValue({ lives: [] });
    renderPage();
    expect(await screen.findByText(/Listeners can join while there's room/)).toBeInTheDocument();
    expect(screen.queryByText(/Up to \d+ people/)).not.toBeInTheDocument();
  });

  it("says when no one is live", async () => {
    api.list.mockResolvedValue({ lives: [] });
    renderPage();
    expect(await screen.findByText(/No one is live right now/)).toBeInTheDocument();
  });

  it("says so when the list can't be loaded", async () => {
    api.list.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByText(/Couldn.t load the lives/)).toBeInTheDocument();
  });
});

describe("LivePage: going live", () => {
  async function submit(title = "My first live") {
    await userEvent.type(screen.getByLabelText("Live title"), title);
    await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  }

  it("needs a title before it will start", async () => {
    renderPage();
    await screen.findByLabelText("Live title");
    expect(screen.getByRole("button", { name: "Go live" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Live title"), "   ");
    expect(screen.getByRole("button", { name: "Go live" })).toBeDisabled();
  });

  it("asks for the microphone first, then creates the live and opens its room with the microphone ready", async () => {
    const stream = new FakeStream();
    getUserMedia.mockResolvedValue(stream);
    api.start.mockResolvedValue({ live: room({ id: "new1", isHost: true }) });
    renderPage();
    await submit("  My first live  ");

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.objectContaining({ echoCancellation: true }), video: false }));
    expect(api.start).toHaveBeenCalledWith("My first live");
    expect(await screen.findByText(/Room/)).toBeInTheDocument();
    expect(getStreamFor("new1")).toBe(stream); // handed to the room page
  });

  it("explains a blocked microphone and doesn't create a live", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    renderPage();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Microphone access was blocked/);
    expect(api.start).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Go live" })).toBeEnabled(); // can try again
  });

  it("explains a missing or busy microphone", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("none", "NotFoundError"));
    renderPage();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/No microphone was found/);
    getUserMedia.mockRejectedValueOnce(new DOMException("busy", "NotReadableError"));
    await userEvent.click(screen.getByRole("button", { name: "Go live" }));
    expect(await screen.findByText(/in use by another app/)).toBeInTheDocument();
  });

  it("turns the microphone back off and shows the server's message if the live can't be created", async () => {
    const stream = new FakeStream();
    getUserMedia.mockResolvedValue(stream);
    api.start.mockRejectedValue(new ApiError(429, "You've started a lot of lives — try again later."));
    renderPage();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("started a lot of lives");
    expect(stream.tracks[0].stopped).toBe(true);
  });

  it("tells people on a browser without live audio, without asking for the microphone", async () => {
    vi.stubGlobal("RTCPeerConnection", undefined);
    renderPage();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't broadcast live audio/);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe("LivePage: scheduled lives", () => {
  const sched = vi.mocked(scheduledApi);
  const plan = (over: Partial<ScheduledLive> = {}): ScheduledLive => ({
    id: "p1",
    title: "Friday jam",
    startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    host,
    isHost: false,
    reminding: false,
    reminderCount: 0,
    ...over,
  });
  beforeEach(() => {
    sched.list.mockReset();
    sched.list.mockResolvedValue({ scheduled: [] });
  });

  it("lists what people have planned", async () => {
    sched.list.mockResolvedValue({ scheduled: [plan(), plan({ id: "p2", title: "Late show" })] });
    renderPage();
    expect(await screen.findByText("Friday jam")).toBeInTheDocument();
    expect(screen.getByText("Late show")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Upcoming lives" })).toBeInTheDocument();
  });

  it("invites the first plan when nothing is scheduled, and carries on if the schedule can't be loaded", async () => {
    renderPage();
    expect(await screen.findByText(/Nothing is scheduled yet/)).toBeInTheDocument();
    cleanup();
    sched.list.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByText(/Nothing is scheduled yet/)).toBeInTheDocument();
    expect(await screen.findByRole("form", { name: "Go live" }).catch(() => screen.getByLabelText("Live title"))).toBeInTheDocument();
  });

  it("adds a plan to the list as soon as it is made, in time order", async () => {
    const soon = plan({ id: "p1", title: "Soon", startsAt: new Date(Date.now() + 2 * 3_600_000).toISOString(), isHost: true });
    const later = plan({ id: "p2", title: "Later", startsAt: new Date(Date.now() + 9 * 3_600_000).toISOString() });
    sched.list.mockResolvedValue({ scheduled: [later] });
    sched.create.mockResolvedValue({ scheduled: soon });
    renderPage();
    await screen.findByText("Later");
    fireEvent.change(screen.getByLabelText("Plan title"), { target: { value: "Soon" } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "2099-01-01T10:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await screen.findByText("Soon");
    const titles = screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(titles).toEqual(["Soon", "Later"]);
  });

  it("starts a planned live from its own button: microphone first, then the live, naming the plan", async () => {
    const stream = new FakeStream();
    getUserMedia.mockResolvedValue(stream);
    api.start.mockResolvedValue({ live: room({ id: "new2", isHost: true }) });
    sched.list.mockResolvedValue({ scheduled: [plan({ isHost: true })] });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Start now" }));
    expect(getUserMedia).toHaveBeenCalled();
    expect(api.start).toHaveBeenCalledWith("Friday jam", "p1");
    expect(await screen.findByText(/Room/)).toBeInTheDocument();
    expect(getStreamFor("new2")).toBe(stream);
  });

  it("takes a reminder request back off the list view when it is toggled", async () => {
    sched.list.mockResolvedValue({ scheduled: [plan()] });
    sched.remind.mockResolvedValue({ reminding: true, reminderCount: 4 });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Remind me about Friday jam" }));
    expect(await screen.findByRole("button", { name: "Stop reminding me about Friday jam" })).toBeInTheDocument();
    expect(screen.getByText(/4 reminding/)).toBeInTheDocument();
  });
});
