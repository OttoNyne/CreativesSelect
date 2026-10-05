import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { EventForm } from "./EventForm";
import { EventCard, isOver } from "./EventCard";
import { RsvpButtons } from "./RsvpButtons";
import { eventsApi } from "../../api/events.api";
import { ApiError } from "../../api/client";
import type { CommunityEvent, User } from "../../types";

vi.mock("../../api/events.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/events.api")>()),
  eventsApi: { create: vi.fn(), update: vi.fn(), rsvp: vi.fn() },
}));
const api = vi.mocked(eventsApi);

const host = { id: "u1", username: "ann", displayName: "Ann", avatarUrl: null } as User;
const HOUR = 3_600_000;
const soon = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const ev = (over: Partial<CommunityEvent> = {}): CommunityEvent => ({
  id: "e1",
  title: "Life drawing night",
  description: "",
  startsAt: soon(48),
  endsAt: null,
  kind: "in_person",
  place: "The Old Mill, Leeds",
  link: "",
  audience: "friends",
  editedAt: null,
  host,
  isHost: false,
  myStatus: null,
  goingCount: 2,
  maybeCount: 1,
  ...over,
});

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("EventForm: planning", () => {
  async function fill(over: { title?: string; place?: string; start?: string } = {}) {
    await userEvent.type(screen.getByLabelText("Title"), over.title ?? "Show and tell");
    if (over.place !== "") await userEvent.type(screen.getByLabelText("Place"), over.place ?? "The Old Mill");
    const start = screen.getByLabelText("Starts") as HTMLInputElement;
    await userEvent.type(start, over.start ?? "2030-05-04T19:30");
  }

  it("asks for a title, a place and a start before sending anything", async () => {
    render(<EventForm onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Plan event" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give your event a title");
    await userEvent.type(screen.getByLabelText("Title"), "Show");
    await userEvent.click(screen.getByRole("button", { name: "Plan event" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Say where it is");
    await userEvent.type(screen.getByLabelText("Place"), "Cafe");
    await userEvent.click(screen.getByRole("button", { name: "Plan event" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a start time");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("sends a trimmed in-person event and clears the form", async () => {
    api.create.mockResolvedValue({ event: ev() });
    const onSaved = vi.fn();
    render(<EventForm onSaved={onSaved} />);
    await fill({ title: "  Show and tell ", place: " The Old Mill " });
    await userEvent.type(screen.getByLabelText("Details (optional)"), "Bring pencils");
    await userEvent.selectOptions(screen.getByLabelText("Who can see it"), "public");
    await userEvent.click(screen.getByRole("button", { name: "Plan event" }));

    expect(api.create).toHaveBeenCalledTimes(1);
    const input = api.create.mock.calls[0][0];
    expect(input).toMatchObject({ title: "Show and tell", kind: "in_person", place: "The Old Mill", description: "Bring pencils", audience: "public" });
    expect(input.startsAt).toBe(new Date("2030-05-04T19:30").toISOString());
    expect(input).not.toHaveProperty("link");
    expect(input).not.toHaveProperty("endsAt");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("sends a link, not a place, for an online event, and an end time when given", async () => {
    api.create.mockResolvedValue({ event: ev({ kind: "online" }) });
    render(<EventForm onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Title"), "Sketch along");
    await userEvent.click(screen.getByLabelText("Online"));
    expect(screen.queryByLabelText("Place")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Link to join"), " https://meet.example.com/x ");
    await userEvent.type(screen.getByLabelText("Starts"), "2030-05-04T19:30");
    await userEvent.type(screen.getByLabelText("Ends (optional)"), "2030-05-04T21:00");
    await userEvent.click(screen.getByRole("button", { name: "Plan event" }));
    const input = api.create.mock.calls[0][0];
    expect(input).toMatchObject({ kind: "online", link: "https://meet.example.com/x" });
    expect(input).not.toHaveProperty("place");
    expect(input.endsAt).toBe(new Date("2030-05-04T21:00").toISOString());
  });

  it("shows the server's reason and keeps what was typed", async () => {
    api.create.mockRejectedValue(new ApiError(400, "Choose a time at least 5 minutes from now"));
    render(<EventForm onSaved={vi.fn()} />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Plan event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 5 minutes");
    expect(screen.getByLabelText("Title")).toHaveValue("Show and tell");
  });
});

describe("EventForm: changing", () => {
  it("starts with the event as it is, and sends only what changed", async () => {
    api.update.mockResolvedValue({ event: ev({ title: "Life drawing, late" }) });
    const onSaved = vi.fn();
    render(<EventForm event={ev({ description: "Bring pencils" })} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Title")).toHaveValue("Life drawing night");
    expect(screen.getByLabelText("Place")).toHaveValue("The Old Mill, Leeds");
    const title = screen.getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Life drawing, late");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const [id, input] = api.update.mock.calls[0];
    expect(id).toBe("e1");
    expect(input).toMatchObject({ title: "Life drawing, late", place: "The Old Mill, Leeds", audience: "friends" });
    expect(input).not.toHaveProperty("startsAt"); // unchanged, so an event that has begun can still have its words fixed
    expect(input).not.toHaveProperty("endsAt");
    expect(onSaved).toHaveBeenCalled();
  });

  it("sends the new start, and removes an end", async () => {
    api.update.mockResolvedValue({ event: ev() });
    render(<EventForm event={ev({ endsAt: soon(50) })} onSaved={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Ends (optional)"));
    await userEvent.clear(screen.getByLabelText("Starts"));
    await userEvent.type(screen.getByLabelText("Starts"), "2030-06-01T10:00");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const input = api.update.mock.calls[0][1];
    expect(input.startsAt).toBe(new Date("2030-06-01T10:00").toISOString());
    expect(input.endsAt).toBeNull();
  });

  it("can be cancelled", async () => {
    const onCancel = vi.fn();
    render(<EventForm event={ev()} onSaved={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("RsvpButtons", () => {
  it("says going, and takes it back by choosing it again", async () => {
    api.rsvp.mockResolvedValueOnce({ myStatus: "going", goingCount: 3, maybeCount: 1 });
    api.rsvp.mockResolvedValueOnce({ myStatus: null, goingCount: 2, maybeCount: 1 });
    const onAnswered = vi.fn();
    const { rerender } = render(<RsvpButtons event={ev()} onAnswered={onAnswered} />);
    await userEvent.click(screen.getByRole("button", { name: "Going" }));
    expect(api.rsvp).toHaveBeenLastCalledWith("e1", "going");
    expect(onAnswered).toHaveBeenLastCalledWith({ myStatus: "going", goingCount: 3, maybeCount: 1 });

    rerender(<RsvpButtons event={ev({ myStatus: "going" })} onAnswered={onAnswered} />);
    expect(screen.getByRole("button", { name: "Going" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Going" }));
    expect(api.rsvp).toHaveBeenLastCalledWith("e1", "none");
  });

  it("switches to maybe, and shows the server's reason when it can't", async () => {
    api.rsvp.mockRejectedValue(new ApiError(409, "That event is over"));
    render(<RsvpButtons event={ev({ myStatus: "going" })} onAnswered={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Maybe" }));
    expect(api.rsvp).toHaveBeenCalledWith("e1", "maybe");
    expect(await screen.findByRole("alert")).toHaveTextContent("That event is over");
  });
});

describe("EventCard", () => {
  const renderCard = (event: CommunityEvent, onChange = vi.fn()) =>
    render(
      <MemoryRouter>
        <EventCard event={event} onChange={onChange} />
      </MemoryRouter>
    );

  it("shows what, when, where, who and how many, linking to the event and the host", () => {
    renderCard(ev());
    expect(screen.getByRole("link", { name: "Life drawing night" })).toHaveAttribute("href", "/events/e1");
    expect(screen.getByText("The Old Mill, Leeds")).toBeInTheDocument();
    expect(screen.getByText("in 2 days")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ann/ })).toHaveAttribute("href", "/u/ann");
    expect(screen.getByText("2 going, 1 maybe")).toBeInTheDocument();
    expect(screen.getByText("Friends")).toBeInTheDocument();
  });

  it("says Online for an online event and Public for a public one", () => {
    renderCard(ev({ kind: "online", place: "", audience: "public" }));
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("lets a guest answer and passes the answer on", async () => {
    api.rsvp.mockResolvedValue({ myStatus: "maybe", goingCount: 2, maybeCount: 2 });
    const onChange = vi.fn();
    renderCard(ev(), onChange);
    await userEvent.click(screen.getByRole("button", { name: "Maybe" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", myStatus: "maybe", maybeCount: 2 }));
  });

  it("gives the host a way to manage it instead of answering, and nothing to answer once it is over", () => {
    renderCard(ev({ isHost: true }));
    expect(screen.queryByRole("button", { name: "Going" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/events/e1");
  });

  it("works out when an event is over", () => {
    expect(isOver(ev({ startsAt: soon(-7) }))).toBe(true); // began long ago, no end
    expect(isOver(ev({ startsAt: soon(-2) }))).toBe(false); // still within the hours after it began
    expect(isOver(ev({ startsAt: soon(-3), endsAt: soon(-1) }))).toBe(true);
    expect(isOver(ev({ startsAt: soon(-3), endsAt: soon(1) }))).toBe(false);
  });
});
