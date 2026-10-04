import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { UpcomingLives } from "./UpcomingLives";
import { scheduledApi } from "../../api/scheduled.api";
import { ApiError } from "../../api/client";
import type { ScheduledLive, User } from "../../types";

vi.mock("../../api/scheduled.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/scheduled.api")>()),
  scheduledApi: { remind: vi.fn(), unremind: vi.fn(), cancel: vi.fn() },
}));
const api = vi.mocked(scheduledApi);

const NOW = new Date("2026-10-10T12:00:00Z");
const person = (id: string, name: string) => ({ id, username: id, displayName: name, avatarUrl: null }) as User;
const plan = (over: Partial<ScheduledLive> = {}): ScheduledLive => ({
  id: "p1",
  title: "Friday jam",
  startsAt: new Date(NOW.getTime() + 3 * 3_600_000).toISOString(),
  host: person("dj", "DJ Kai"),
  isHost: false,
  reminding: false,
  reminderCount: 0,
  ...over,
});
function setup(plans: ScheduledLive[] | null, over: Partial<React.ComponentProps<typeof UpcomingLives>> = {}) {
  const props = { plans, onChange: vi.fn(), onStartNow: vi.fn(), starting: false, now: NOW, ...over };
  render(
    <MemoryRouter>
      <UpcomingLives {...props} />
    </MemoryRouter>
  );
  return props;
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  window.confirm = vi.fn(() => true);
});

describe("UpcomingLives", () => {
  it("lists each plan with who, when, and how long until it starts", () => {
    setup([plan({ reminderCount: 3 })]);
    expect(screen.getByText("Friday jam")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DJ Kai" })).toHaveAttribute("href", "/u/dj");
    expect(screen.getByText("in 3 hours")).toBeInTheDocument();
    expect(screen.getByText(/3 reminding/)).toBeInTheDocument();
  });

  it("says when it is loading", () => {
    setup(null);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("invites the first plan when there are none", () => {
    setup([]);
    expect(screen.getByText(/Nothing is scheduled yet/)).toBeInTheDocument();
  });

  it("lets someone ask to be reminded, and shows it", async () => {
    api.remind.mockResolvedValue({ reminding: true, reminderCount: 1 });
    const props = setup([plan()]);
    const button = screen.getByRole("button", { name: "Remind me about Friday jam" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(api.remind).toHaveBeenCalledWith("p1");
    expect(props.onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "p1", reminding: true, reminderCount: 1 })]);
  });

  it("lets them stop, too", async () => {
    api.unremind.mockResolvedValue({ reminding: false, reminderCount: 0 });
    const props = setup([plan({ reminding: true, reminderCount: 1 })]);
    const button = screen.getByRole("button", { name: "Stop reminding me about Friday jam" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Reminding you");
    await userEvent.click(button);
    expect(api.unremind).toHaveBeenCalledWith("p1");
    expect(props.onChange).toHaveBeenCalledWith([expect.objectContaining({ reminding: false, reminderCount: 0 })]);
  });

  it("shows the server's reason when a reminder is refused", async () => {
    api.remind.mockRejectedValue(new ApiError(409, "That live has already started"));
    const props = setup([plan()]);
    await userEvent.click(screen.getByRole("button", { name: /Remind me about/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already started");
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("gives the host Start now and Cancel instead of a reminder", async () => {
    const mine = plan({ isHost: true });
    const props = setup([mine]);
    expect(screen.queryByRole("button", { name: /Remind me/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "You" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start now" }));
    expect(props.onStartNow).toHaveBeenCalledWith(mine);
  });

  it("holds Start now while a live is already starting", () => {
    setup([plan({ isHost: true })], { starting: true });
    expect(screen.getByRole("button", { name: "Start now" })).toBeDisabled();
  });

  it("cancels after a confirmation, and not if it is declined", async () => {
    api.cancel.mockResolvedValue(undefined);
    const props = setup([plan({ isHost: true }), plan({ id: "p2", title: "Other", isHost: true })]);
    window.confirm = vi.fn(() => false);
    await userEvent.click(screen.getByRole("button", { name: "Cancel Friday jam" }));
    expect(api.cancel).not.toHaveBeenCalled();
    window.confirm = vi.fn(() => true);
    await userEvent.click(screen.getByRole("button", { name: "Cancel Friday jam" }));
    expect(api.cancel).toHaveBeenCalledWith("p1");
    expect(props.onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "p2" })]);
  });

  it("says so when a plan can't be cancelled", async () => {
    api.cancel.mockRejectedValue(new ApiError(404, "Scheduled live not found"));
    setup([plan({ isHost: true })]);
    await userEvent.click(screen.getByRole("button", { name: "Cancel Friday jam" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not found");
  });
});
