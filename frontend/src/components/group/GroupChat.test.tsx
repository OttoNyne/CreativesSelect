import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { GroupChat } from "./GroupChat";
import { groupsApi } from "../../api/groups.api";
import { ApiError } from "../../api/client";
import type { GroupChatMessage, User } from "../../types";

vi.mock("../../api/groups.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/groups.api")>()),
  groupsApi: { messages: vi.fn(), sendMessage: vi.fn(), deleteMessage: vi.fn() },
}));
const api = vi.mocked(groupsApi);

const ada = { id: "u1", username: "ada", displayName: "Ada", avatarUrl: null } as User;
const zoe = { id: "u2", username: "zoe", displayName: "Zoe", avatarUrl: null } as User;
const msg = (id: string, body: string, who: User, mine = false): GroupChatMessage => ({
  id,
  groupId: "g1",
  senderId: who.id,
  sender: who,
  mine,
  body,
  createdAt: new Date().toISOString(),
});

function renderChat(canModerate = false) {
  render(
    <MemoryRouter>
      <GroupChat groupId="g1" canModerate={canModerate} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.messages.mockResolvedValue({ messages: [msg("m1", "Critique night?", ada), msg("m2", "I'm in", zoe, true)], hasMore: false });
  window.confirm = vi.fn(() => true);
});

describe("GroupChat", () => {
  it("shows who said what, naming the viewer 'You' and linking to profiles", async () => {
    renderChat();
    expect(await screen.findByText("Critique night?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByRole("link", { name: "You" })).toHaveAttribute("href", "/u/zoe");
    expect(api.messages).toHaveBeenCalledWith("g1");
  });

  it("invites the first message in an empty chat", async () => {
    api.messages.mockResolvedValue({ messages: [], hasMore: false });
    renderChat();
    expect(await screen.findByText(/No messages yet/)).toBeInTheDocument();
  });

  it("shows the server's message if the chat can't be opened", async () => {
    api.messages.mockRejectedValue(new ApiError(403, "Join this group to use its chat"));
    renderChat();
    expect(await screen.findByText("Join this group to use its chat")).toBeInTheDocument();
    expect(screen.queryByLabelText("Group message")).not.toBeInTheDocument();
  });

  it("sends a trimmed message, appends it and clears the box; Enter sends, Shift+Enter doesn't", async () => {
    api.sendMessage.mockResolvedValue({ message: msg("m3", "See you at 7", zoe, true) });
    renderChat();
    const box = await screen.findByLabelText("Group message");
    await userEvent.type(box, "  See you at 7  {Enter}");
    expect(api.sendMessage).toHaveBeenCalledWith("g1", "See you at 7");
    expect(await screen.findByText("See you at 7")).toBeInTheDocument();
    expect(box).toHaveValue("");

    api.sendMessage.mockClear();
    await userEvent.type(box, "a{Shift>}{Enter}{/Shift}b");
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(box).toHaveValue("a\nb");
  });

  it("won't send an empty message", async () => {
    renderChat();
    await screen.findByLabelText("Group message");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("keeps the draft and shows the server's message when sending fails", async () => {
    api.sendMessage.mockRejectedValue(new ApiError(429, "You're sending messages too fast — try again in a few minutes."));
    renderChat();
    const box = await screen.findByLabelText("Group message");
    await userEvent.type(box, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/sending messages too fast/)).toBeInTheDocument();
    expect(box).toHaveValue("hello");
  });

  it("lets you delete your own message but not others' (unless you moderate)", async () => {
    api.deleteMessage.mockResolvedValue(undefined);
    renderChat(false);
    await screen.findByText("I'm in");
    const buttons = screen.getAllByRole("button", { name: "Delete message" });
    expect(buttons).toHaveLength(1); // only Zoe's own
    await userEvent.click(buttons[0]);
    expect(api.deleteMessage).toHaveBeenCalledWith("g1", "m2");
    await waitFor(() => expect(screen.queryByText("I'm in")).not.toBeInTheDocument());
  });

  it("gives group admins a delete button on everyone's messages", async () => {
    renderChat(true);
    await screen.findByText("Critique night?");
    expect(screen.getAllByRole("button", { name: "Delete message" })).toHaveLength(2);
  });

  it("doesn't delete when the confirmation is declined", async () => {
    window.confirm = vi.fn(() => false);
    renderChat();
    await screen.findByText("I'm in");
    await userEvent.click(screen.getByRole("button", { name: "Delete message" }));
    expect(api.deleteMessage).not.toHaveBeenCalled();
    expect(screen.getByText("I'm in")).toBeInTheDocument();
  });

  it("loads earlier messages", async () => {
    api.messages.mockResolvedValueOnce({ messages: [msg("m9", "newest", ada)], hasMore: true });
    api.messages.mockResolvedValueOnce({ messages: [msg("m1", "oldest", ada)], hasMore: false });
    renderChat();
    await userEvent.click(await screen.findByRole("button", { name: "Load earlier messages" }));
    expect(api.messages).toHaveBeenLastCalledWith("g1", "m9");
    expect(await screen.findByText("oldest")).toBeInTheDocument();
    expect(screen.getByText("newest")).toBeInTheDocument();
  });

  it("labels messages from a deleted account", async () => {
    api.messages.mockResolvedValue({ messages: [{ ...msg("m1", "ghost message", ada), sender: null }], hasMore: false });
    renderChat();
    expect(await screen.findByText("Former member")).toBeInTheDocument();
  });
});
