import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleLive } from "./ScheduleLive";
import { scheduledApi } from "../../api/scheduled.api";
import { ApiError } from "../../api/client";
import type { ScheduledLive, User } from "../../types";

vi.mock("../../api/scheduled.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/scheduled.api")>()),
  scheduledApi: { create: vi.fn() },
}));
const api = vi.mocked(scheduledApi);
const plan = { id: "p1", title: "Friday jam", startsAt: "2026-10-10T19:00:00.000Z", host: { id: "h", username: "dj", displayName: "DJ", avatarUrl: null } as User, isHost: true, reminding: false, reminderCount: 0 } satisfies ScheduledLive;

const fill = (title: string, when: string) => {
  fireEvent.change(screen.getByLabelText("Plan title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Start time"), { target: { value: when } });
};

beforeEach(() => {
  api.create.mockReset();
});

describe("ScheduleLive", () => {
  it("sends the title and the time (as an exact instant) and hands back the new plan, then clears", async () => {
    api.create.mockResolvedValue({ scheduled: plan });
    const onScheduled = vi.fn();
    render(<ScheduleLive onScheduled={onScheduled} />);
    fill("  Friday jam  ", "2099-10-10T19:00");
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(api.create).toHaveBeenCalledWith("Friday jam", new Date("2099-10-10T19:00").toISOString());
    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith(plan));
    expect(screen.getByLabelText("Plan title")).toHaveValue("");
    expect(screen.getByLabelText("Start time")).toHaveValue("");
  });

  it("asks for a title and a time before sending anything", async () => {
    render(<ScheduleLive onScheduled={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give your live a title");
    fill("Jam", "");
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a start time");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("only offers times from a few minutes ahead", () => {
    render(<ScheduleLive onScheduled={vi.fn()} />);
    expect(screen.getByLabelText("Start time")).toHaveAttribute("min");
    expect(screen.getByLabelText("Start time")).toHaveAttribute("type", "datetime-local");
  });

  it("shows the server's reason and keeps what was typed", async () => {
    api.create.mockRejectedValue(new ApiError(400, "You can have up to 5 lives scheduled at once"));
    const onScheduled = vi.fn();
    render(<ScheduleLive onScheduled={onScheduled} />);
    fill("Jam", "2099-10-10T19:00");
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 5 lives");
    expect(screen.getByLabelText("Plan title")).toHaveValue("Jam");
    expect(onScheduled).not.toHaveBeenCalled();
  });

  it("has a plain message for an unexpected failure, and can't be sent twice at once", async () => {
    let fail: (e: unknown) => void = () => {};
    api.create.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    render(<ScheduleLive onScheduled={vi.fn()} />);
    fill("Jam", "2099-10-10T19:00");
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByRole("button", { name: "Scheduling…" })).toBeDisabled();
    fail(new TypeError("Failed to fetch"));
    expect(await screen.findByText("Couldn't schedule that live.")).toBeInTheDocument();
  });
});
