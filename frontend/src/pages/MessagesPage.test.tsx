import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MessagesPage } from "./MessagesPage";
import { messagesApi } from "../api/messages.api";
import { ApiError } from "../api/client";
import type { Conversation, DirectMessage, User } from "../types";

vi.mock("../api/messages.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/messages.api")>()),
  messagesApi: { conversations: vi.fn(), thread: vi.fn(), send: vi.fn(), remove: vi.fn(), unreadCount: vi.fn() },
}));
const api = vi.mocked(messagesApi);

const zoe = { id: "u2", username: "zoe", displayName: "Zoe", avatarUrl: null } as User;
const kai = { id: "u3", username: "kai", displayName: "Kai", avatarUrl: null } as User;
const msg = (id: string, body: string, mine: boolean, extra: Partial<DirectMessage> = {}): DirectMessage => ({
  id,
  senderId: mine ? "me" : "u2",
  recipientId: mine ? "u2" : "me",
  mine,
  body,
  readAt: null,
  createdAt: new Date().toISOString(),
  ...extra,
});
const conversations: Conversation[] = [
  { user: zoe, lastMessage: msg("m2", "See you then", false), unread: 2 },
  { user: kai, lastMessage: null, unread: 0 },
];

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:username" element={<MessagesPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.conversations.mockResolvedValue({ conversations });
  api.thread.mockResolvedValue({ user: zoe, messages: [msg("m1", "Free Friday?", true, { readAt: "x" }), msg("m2", "See you then", false)], hasMore: false });
  window.confirm = vi.fn(() => true);
});

describe("MessagesPage", () => {
  it("lists friends with the latest message and unread count, linking to each conversation", async () => {
    renderAt("/messages");
    const zoeLink = await screen.findByRole("link", { name: /Zoe/ });
    expect(zoeLink).toHaveAttribute("href", "/messages/zoe");
    expect(zoeLink).toHaveTextContent("See you then");
    expect(screen.getByLabelText("2 unread")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kai/ })).toHaveTextContent("No messages yet");
    expect(screen.getByText("Choose a friend to start chatting.")).toBeInTheDocument();
  });

  it("points people without friends to search", async () => {
    api.conversations.mockResolvedValue({ conversations: [] });
    renderAt("/messages");
    expect(await screen.findByRole("link", { name: "Find creatives" })).toHaveAttribute("href", "/search");
  });

  it("shows an error when the conversation list can't load", async () => {
    api.conversations.mockRejectedValue(new Error("down"));
    renderAt("/messages");
    expect(await screen.findByText(/Couldn.t load your conversations/)).toBeInTheDocument();
  });

  it("opens a thread: messages in order, mine marked, seen shown", async () => {
    renderAt("/messages/zoe");
    expect(await screen.findByText("Free Friday?")).toBeInTheDocument();
    expect(screen.getByText("See you then", { selector: "div.max-w-\\[80\\%\\]" })).toBeInTheDocument();
    expect(screen.getByText("Seen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zoe" })).toHaveAttribute("href", "/u/zoe");
    expect(api.thread).toHaveBeenCalledWith("zoe");
  });

  it("sends a trimmed message, appends it and clears the box", async () => {
    api.send.mockResolvedValue({ message: msg("m3", "On my way", true) });
    renderAt("/messages/zoe");
    const box = await screen.findByLabelText("Message");
    await userEvent.type(box, "  On my way  ");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(api.send).toHaveBeenCalledWith("zoe", "On my way");
    expect(await screen.findByText("On my way")).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("sends on Enter, but Shift+Enter adds a new line instead", async () => {
    api.send.mockResolvedValue({ message: msg("m3", "hi", true) });
    renderAt("/messages/zoe");
    const box = await screen.findByLabelText("Message");
    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(api.send).not.toHaveBeenCalled();
    expect(box).toHaveValue("line one\nline two");
    await userEvent.type(box, "{Enter}");
    expect(api.send).toHaveBeenCalledWith("zoe", "line one\nline two");
  });

  it("won't send an empty message", async () => {
    renderAt("/messages/zoe");
    await screen.findByLabelText("Message");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Message"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("keeps the draft and shows the server's message when sending fails", async () => {
    api.send.mockRejectedValue(new ApiError(429, "You're sending messages too fast — try again in a few minutes."));
    renderAt("/messages/zoe");
    const box = await screen.findByLabelText("Message");
    await userEvent.type(box, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/sending messages too fast/)).toBeInTheDocument();
    expect(box).toHaveValue("hello");
  });

  it("deletes one of my messages after confirming, and only mine have the option", async () => {
    api.remove.mockResolvedValue(undefined);
    renderAt("/messages/zoe");
    await screen.findByText("Free Friday?");
    const deletes = screen.getAllByRole("button", { name: "Delete message" });
    expect(deletes).toHaveLength(1); // the other person's message has none
    await userEvent.click(deletes[0]);
    expect(api.remove).toHaveBeenCalledWith("m1");
    await waitFor(() => expect(screen.queryByText("Free Friday?")).not.toBeInTheDocument());
  });

  it("doesn't delete when the confirmation is declined", async () => {
    window.confirm = vi.fn(() => false);
    renderAt("/messages/zoe");
    await screen.findByText("Free Friday?");
    await userEvent.click(screen.getByRole("button", { name: "Delete message" }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText("Free Friday?")).toBeInTheDocument();
  });

  it("loads earlier messages when there are more", async () => {
    api.thread.mockResolvedValueOnce({ user: zoe, messages: [msg("m5", "newest", false)], hasMore: true });
    api.thread.mockResolvedValueOnce({ user: zoe, messages: [msg("m1", "oldest", false)], hasMore: false });
    renderAt("/messages/zoe");
    await userEvent.click(await screen.findByRole("button", { name: "Load earlier messages" }));
    expect(api.thread).toHaveBeenLastCalledWith("zoe", "m5");
    expect(await screen.findByText("oldest")).toBeInTheDocument();
    expect(screen.getByText("newest")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).not.toBeInTheDocument();
  });

  it("explains when you can't message someone (not a friend / blocked) and offers a way back", async () => {
    api.thread.mockRejectedValue(new ApiError(403, "You can only message your friends"));
    renderAt("/messages/stranger");
    expect(await screen.findByText("You can only message your friends")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to messages" })).toBeInTheDocument();
  });

  it("invites a first message in an empty conversation", async () => {
    api.thread.mockResolvedValue({ user: kai, messages: [], hasMore: false });
    renderAt("/messages/kai");
    expect(await screen.findByText(/No messages yet — say hello/)).toBeInTheDocument();
  });
});
