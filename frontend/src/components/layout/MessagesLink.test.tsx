import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MessagesLink } from "./MessagesLink";
import { messagesApi, announceMessagesChanged } from "../../api/messages.api";

vi.mock("../../api/messages.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/messages.api")>()),
  messagesApi: { unreadCount: vi.fn() },
}));
const unreadCount = vi.mocked(messagesApi.unreadCount);

function renderLink() {
  render(
    <MemoryRouter>
      <MessagesLink />
    </MemoryRouter>
  );
}

beforeEach(() => {
  unreadCount.mockReset();
});

describe("MessagesLink", () => {
  it("links to /messages with no badge when nothing is unread", async () => {
    unreadCount.mockResolvedValue({ unread: 0 });
    renderLink();
    expect(await screen.findByRole("link", { name: "Messages" })).toHaveAttribute("href", "/messages");
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it("shows the unread count, capped at 99+", async () => {
    unreadCount.mockResolvedValue({ unread: 3 });
    renderLink();
    expect(await screen.findByLabelText("3 unread")).toHaveTextContent("3");
  });

  it("caps very large counts", async () => {
    unreadCount.mockResolvedValue({ unread: 250 });
    renderLink();
    expect(await screen.findByLabelText("250 unread")).toHaveTextContent("99+");
  });

  it("refreshes right away when a thread is opened or a message sent", async () => {
    unreadCount.mockResolvedValue({ unread: 2 });
    renderLink();
    expect(await screen.findByLabelText("2 unread")).toBeInTheDocument();

    unreadCount.mockResolvedValue({ unread: 0 });
    await act(async () => announceMessagesChanged());
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it("keeps working (no badge, no crash) when the count can't be loaded", async () => {
    unreadCount.mockRejectedValue(new Error("offline"));
    renderLink();
    expect(await screen.findByRole("link", { name: "Messages" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });
});
