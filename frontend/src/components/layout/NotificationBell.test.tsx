import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { notificationsApi } from "../../api/notifications.api";
import { ApiError } from "../../api/client";
import type { Notification } from "../../types";

vi.mock("../../api/notifications.api", () => ({
  notificationsApi: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), acceptOffer: vi.fn() },
}));
vi.mock("../../api/friends.api", () => ({ friendsApi: { accept: vi.fn(), decline: vi.fn() } }));
const api = vi.mocked(notificationsApi);

const actor = { id: "u2", username: "zoe", displayName: "Zoe" } as never;
function note(over: Partial<Notification>): Notification {
  return { id: "n1", recipientId: "me", type: "comment", payload: {}, actor, isRead: false, createdAt: new Date().toISOString(), ...over };
}

async function openWith(notifications: Notification[]) {
  api.list.mockResolvedValue({ notifications });
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByLabelText("Notifications"));
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.markRead.mockResolvedValue(undefined);
});

describe("NotificationBell: help offers", () => {
  it("shows an offer with its note and lets the owner accept it", async () => {
    api.acceptOffer.mockResolvedValue({ message: "Offer accepted" });
    await openWith([
      note({ type: "help_offer", payload: { title: "Logo for my zine", message: "I can sketch this", accepted: false } }),
    ]);

    expect(screen.getByText(/offered to help with "Logo for my zine"/)).toBeInTheDocument();
    expect(screen.getByText(/I can sketch this/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept offer" }));
    expect(api.acceptOffer).toHaveBeenCalledWith("n1");
    expect(await screen.findByText("Accepted ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept offer" })).not.toBeInTheDocument();
  });

  it("shows an already-accepted offer as accepted, with no button", async () => {
    await openWith([note({ type: "help_offer", payload: { title: "Logo", accepted: true } })]);
    expect(screen.getByText("Accepted ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept offer" })).not.toBeInTheDocument();
  });

  it("tells the offerer their offer was accepted", async () => {
    await openWith([note({ type: "help_accepted", payload: { title: "Logo for my zine" } })]);
    expect(screen.getByText(/accepted your offer to help with "Logo for my zine"/)).toBeInTheDocument();
  });

  it("alerts with the server's message if accepting fails", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    api.acceptOffer.mockRejectedValue(new ApiError(404, "Offer not found"));
    await openWith([note({ type: "help_offer", payload: { title: "Logo", accepted: false } })]);

    await userEvent.click(screen.getByRole("button", { name: "Accept offer" }));

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Offer not found"));
    expect(screen.getByRole("button", { name: "Accept offer" })).toBeInTheDocument();
    alertSpy.mockRestore();
  });
});
