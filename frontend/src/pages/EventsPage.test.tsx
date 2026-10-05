import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventsPage } from "./EventsPage";
import { EventDetailPage } from "./EventDetailPage";
import { eventsApi } from "../api/events.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { CommunityEvent, User } from "../types";

vi.mock("../api/events.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/events.api")>()),
  eventsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), cancel: vi.fn(), rsvp: vi.fn(), guests: vi.fn(), calendarUrl: (id: string) => `/api/events/${id}/calendar.ics` },
}));
vi.mock("../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(eventsApi);

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name, avatarUrl: null }) as User;
const HOUR = 3_600_000;
const soon = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const ev = (over: Partial<CommunityEvent> = {}): CommunityEvent => ({
  id: "e1",
  title: "Life drawing night",
  description: "Bring pencils\nand paper",
  startsAt: soon(48),
  endsAt: null,
  kind: "in_person",
  place: "The Old Mill, Leeds",
  link: "",
  audience: "friends",
  editedAt: null,
  host: person("u1", "Ann"),
  isHost: false,
  myStatus: null,
  goingCount: 2,
  maybeCount: 1,
  ...over,
});

function signIn() {
  vi.mocked(useAuth).mockReturnValue({ user: person("me", "Me"), isLoading: false, setUser: () => {}, refresh: async () => {} });
}

beforeEach(() => {
  for (const key of ["list", "get", "create", "update", "cancel", "rsvp", "guests"] as const) api[key].mockReset();
  vi.mocked(moderationApi.report).mockReset();
  signIn();
  window.confirm = vi.fn(() => true);
});

describe("EventsPage", () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    );

  it("lists what is coming up, and says so when nothing is", async () => {
    api.list.mockResolvedValueOnce({ events: [ev(), ev({ id: "e2", title: "Sketch along" })], page: 1, hasMore: false });
    renderPage();
    expect(await screen.findByRole("link", { name: "Life drawing night" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sketch along" })).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith("upcoming");
  });

  it("explains an empty list", async () => {
    api.list.mockResolvedValue({ events: [], page: 1, hasMore: false });
    renderPage();
    expect(await screen.findByText(/Nothing is planned yet/)).toBeInTheDocument();
  });

  it("switches between coming up, going and mine", async () => {
    api.list.mockResolvedValue({ events: [], page: 1, hasMore: false });
    renderPage();
    await screen.findByText(/Nothing is planned yet/);
    await userEvent.click(screen.getByRole("button", { name: "I'm going" }));
    expect(await screen.findByText(/haven't answered any events/)).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith("going");
    await userEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(await screen.findByText(/haven't planned an event/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows more a page at a time without repeats", async () => {
    api.list.mockResolvedValueOnce({ events: [ev()], page: 1, hasMore: true });
    api.list.mockResolvedValueOnce({ events: [ev(), ev({ id: "e2", title: "Later one" })], page: 2, hasMore: false });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show more events" }));
    expect(api.list).toHaveBeenLastCalledWith("upcoming", 2);
    expect(await screen.findByRole("link", { name: "Later one" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Life drawing night" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more events" })).not.toBeInTheDocument();
  });

  it("shows the reason if the events can't be loaded", async () => {
    api.list.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
  });

  it("plans an event and shows it in the list", async () => {
    api.list.mockResolvedValue({ events: [], page: 1, hasMore: false });
    api.create.mockResolvedValue({ event: ev({ id: "e9", title: "My new event", isHost: true }) });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Plan an event" }));
    await userEvent.type(screen.getByLabelText("Title"), "My new event");
    await userEvent.type(screen.getByLabelText("Place"), "Cafe");
    await userEvent.type(screen.getByLabelText("Starts"), "2030-05-04T19:30");
    await userEvent.click(screen.getByRole("button", { name: "Plan event" }));
    expect(await screen.findByRole("link", { name: "My new event" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Plan an event" })).not.toBeInTheDocument();
  });

  it("points to the Live page for audio sessions", async () => {
    api.list.mockResolvedValue({ events: [], page: 1, hasMore: false });
    renderPage();
    expect(await screen.findByRole("link", { name: "Live page" })).toHaveAttribute("href", "/live");
  });
});

describe("EventDetailPage", () => {
  const renderDetail = () =>
    render(
      <MemoryRouter initialEntries={["/events/e1"]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/events" element={<div>All events page</div>} />
        </Routes>
      </MemoryRouter>
    );

  beforeEach(() => {
    api.guests.mockImplementation(async (_id, status) => ({ guests: status === "going" ? [person("g1", "Bob"), person("g2", "Cara")] : [person("g3", "Dan")], page: 1, hasMore: false }));
  });

  it("shows the event, its description as plain text, who is going and who might", async () => {
    api.get.mockResolvedValue({ event: ev({ description: "Bring <b>pencils</b>" }) });
    renderDetail();
    expect(await screen.findByRole("heading", { name: /Life drawing night/ })).toBeInTheDocument();
    expect(screen.getByText("The Old Mill, Leeds")).toBeInTheDocument();
    expect(screen.getByText("Bring <b>pencils</b>")).toBeInTheDocument();
    expect(document.querySelector("article b")).toBeNull();
    expect(await screen.findByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/u/bob");
    expect(screen.getByRole("region", { name: "Going (2)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dan/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add to calendar" })).toHaveAttribute("href", "/api/events/e1/calendar.ics");
  });

  it("links an online event's address to another site safely", async () => {
    api.get.mockResolvedValue({ event: ev({ kind: "online", place: "", link: "https://meet.example.com/room" }) });
    renderDetail();
    const link = await screen.findByRole("link", { name: "Join link" });
    expect(link).toHaveAttribute("href", "https://meet.example.com/room");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/opens another site/)).toBeInTheDocument();
  });

  it("lets a guest answer and the counts follow", async () => {
    api.get.mockResolvedValue({ event: ev() });
    api.rsvp.mockResolvedValue({ myStatus: "going", goingCount: 3, maybeCount: 1 });
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Going" }));
    expect(await screen.findByRole("region", { name: "Going (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Going" })).toHaveAttribute("aria-pressed", "true");
  });

  it("lets the host change it, and shows it marked as edited", async () => {
    api.get.mockResolvedValue({ event: ev({ isHost: true }) });
    api.update.mockResolvedValue({ event: ev({ isHost: true, title: "Life drawing, late", editedAt: new Date().toISOString() }) });
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Life drawing, late");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: /Life drawing, late/ })).toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Going" })).not.toBeInTheDocument();
  });

  it("lets the host cancel after a confirmation, and goes back to the list", async () => {
    api.get.mockResolvedValue({ event: ev({ isHost: true }) });
    api.cancel.mockResolvedValue(undefined);
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel event" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.cancel).toHaveBeenCalledWith("e1");
    expect(await screen.findByText("All events page")).toBeInTheDocument();
  });

  it("keeps the event if the host doesn't confirm", async () => {
    window.confirm = vi.fn(() => false);
    api.get.mockResolvedValue({ event: ev({ isHost: true }) });
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel event" }));
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("offers a guest a report, and no edit or cancel", async () => {
    api.get.mockResolvedValue({ event: ev() });
    vi.spyOn(window, "prompt").mockReturnValue("spam");
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(moderationApi.report).mockResolvedValue({ report: {} });
    renderDetail();
    expect(screen.queryByRole("button", { name: "Cancel event" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("event", "e1", "spam");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("says when it is over and offers nothing to answer", async () => {
    api.get.mockResolvedValue({ event: ev({ startsAt: soon(-9) }) });
    renderDetail();
    expect(await screen.findByText("This event is over.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Going" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add to calendar" })).not.toBeInTheDocument();
  });

  it("shows the server's message for an event that can't be seen", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Event not found"));
    renderDetail();
    expect(await screen.findByRole("alert")).toHaveTextContent("Event not found");
    expect(screen.getByRole("link", { name: "← All events" })).toHaveAttribute("href", "/events");
  });

  it("shows more guests", async () => {
    api.get.mockResolvedValue({ event: ev({ goingCount: 60 }) });
    api.guests.mockImplementation(async (_id, status, page = 1) => {
      if (status === "maybe") return { guests: [], page: 1, hasMore: false };
      return page === 1 ? { guests: [person("g1", "Bob")], page: 1, hasMore: true } : { guests: [person("g2", "Cara")], page: 2, hasMore: false };
    });
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(api.guests).toHaveBeenCalledWith("e1", "going", 2);
    expect(await screen.findByRole("link", { name: /Cara/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument());
  });
});
