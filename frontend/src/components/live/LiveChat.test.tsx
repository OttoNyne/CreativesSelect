import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LiveChat } from "./LiveChat";
import { liveApi } from "../../api/live.api";
import { ApiError } from "../../api/client";
import type { LiveComment, User } from "../../types";

vi.mock("../../api/live.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/live.api")>()),
  liveApi: { comments: vi.fn(), comment: vi.fn(), deleteComment: vi.fn() },
}));
const api = vi.mocked(liveApi);

const ada = { id: "u1", username: "ada", displayName: "Ada", avatarUrl: null } as User;
const zoe = { id: "u2", username: "zoe", displayName: "Zoe", avatarUrl: null } as User;
const c = (id: string, body: string, user: User, mine = false): LiveComment => ({ id, userId: user.id, user, mine, body, createdAt: new Date().toISOString() });

function renderChat(props: Partial<{ isHost: boolean; open: boolean }> = {}) {
  render(
    <MemoryRouter>
      <LiveChat liveId="l1" isHost={props.isHost ?? false} open={props.open ?? true} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.comments.mockResolvedValue({ comments: [c("c1", "Love this", ada), c("c2", "Same!", zoe, true)] });
});
afterEach(() => vi.useRealTimers());

describe("LiveChat", () => {
  it("shows the comments with who wrote them, 'You' for your own", async () => {
    renderChat();
    expect(await screen.findByText(/Love this/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByRole("link", { name: "You" })).toHaveAttribute("href", "/u/zoe");
    expect(api.comments).toHaveBeenCalledWith("l1", undefined);
  });

  it("says so when there are none yet", async () => {
    api.comments.mockResolvedValue({ comments: [] });
    renderChat();
    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });

  it("polls for newer comments only, adding them without duplicates", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChat();
    await screen.findByText(/Love this/);
    api.comments.mockResolvedValue({ comments: [c("c2", "Same!", zoe, true), c("c3", "Encore!", ada)] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(api.comments).toHaveBeenLastCalledWith("l1", "c2"); // after the newest it has
    expect(await screen.findByText(/Encore!/)).toBeInTheDocument();
    expect(screen.getAllByText(/Same!/)).toHaveLength(1);
  });

  it("keeps showing what it has when a poll fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChat();
    await screen.findByText(/Love this/);
    api.comments.mockRejectedValue(new TypeError("offline"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText(/Love this/)).toBeInTheDocument();
  });

  it("sends a trimmed comment, shows it and clears the box", async () => {
    api.comment.mockResolvedValue({ comment: c("c9", "Great set", zoe, true) });
    renderChat();
    const box = await screen.findByLabelText("Comment");
    await userEvent.type(box, "  Great set  ");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(api.comment).toHaveBeenCalledWith("l1", "Great set");
    expect(await screen.findByText(/Great set/)).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("won't send an empty comment", async () => {
    renderChat();
    await screen.findByLabelText("Comment");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("keeps the draft and shows the server's message when sending fails", async () => {
    api.comment.mockRejectedValue(new ApiError(429, "You're commenting too fast — wait a moment."));
    renderChat();
    const box = await screen.findByLabelText("Comment");
    await userEvent.type(box, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/commenting too fast/)).toBeInTheDocument();
    expect(box).toHaveValue("hello");
  });

  it("is read-only until you've joined", async () => {
    renderChat({ open: false });
    expect(await screen.findByText("Join the live to chat.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Comment")).not.toBeInTheDocument();
  });

  it("lets you remove your own comments, and the host remove anyone's", async () => {
    api.deleteComment.mockResolvedValue(undefined);
    renderChat();
    await screen.findByText(/Love this/);
    const mine = screen.getAllByRole("button", { name: "Delete comment" });
    expect(mine).toHaveLength(1); // only Zoe's own
    await userEvent.click(mine[0]);
    expect(api.deleteComment).toHaveBeenCalledWith("l1", "c2");
    await waitFor(() => expect(screen.queryByText(/Same!/)).not.toBeInTheDocument());
  });

  it("gives the host a delete button on everything", async () => {
    renderChat({ isHost: true });
    await screen.findByText(/Love this/);
    expect(screen.getAllByRole("button", { name: "Delete comment" })).toHaveLength(2);
  });

  it("shows the server's message if deleting fails and keeps the comment", async () => {
    api.deleteComment.mockRejectedValue(new ApiError(404, "Comment not found"));
    renderChat({ isHost: true });
    await screen.findByText(/Love this/);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete comment" })[0]);
    expect(await screen.findByText("Comment not found")).toBeInTheDocument();
    expect(screen.getByText(/Love this/)).toBeInTheDocument();
  });
});
