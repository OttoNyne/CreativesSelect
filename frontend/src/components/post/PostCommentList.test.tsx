import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostCommentList } from "./PostCommentList";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../api/posts.api", () => ({ postsApi: { comments: vi.fn(), addComment: vi.fn(), updateComment: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(postsApi);

function comment(id: string, name: string, content: string): Comment {
  return { id, content, createdAt: "", author: { id: "u-" + id, username: name.toLowerCase(), displayName: name } as User } as Comment;
}

function renderList(signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({
    user: signedIn ? ({ id: "me", username: "me" } as User) : null,
    isLoading: false,
    setUser: () => {},
    refresh: async () => {},
  });
  const onCountChange = vi.fn();
  render(<PostCommentList postId="p1" onCountChange={onCountChange} />);
  return onCountChange;
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.comments.mockResolvedValue({ comments: [comment("c1", "Zoe", "Love it"), comment("c2", "Kai", "Nice colors")] });
});

describe("PostCommentList", () => {
  it("lists the comments with their authors", async () => {
    renderList();
    expect(await screen.findByText("Love it")).toBeInTheDocument();
    expect(screen.getByText("Zoe")).toBeInTheDocument();
    expect(screen.getByText("Nice colors")).toBeInTheDocument();
  });

  it("adds a trimmed comment to the end and reports the new count", async () => {
    api.addComment.mockResolvedValue({ comment: comment("c3", "Me", "Great work") });
    const onCountChange = renderList();
    await screen.findByText("Love it");
    await userEvent.type(screen.getByPlaceholderText("Write a comment…"), "  Great work ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(api.addComment).toHaveBeenCalledWith("p1", "Great work");
    expect(await screen.findByText("Great work")).toBeInTheDocument();
    // told as a change to the post's count, since the list may hold only some of the comments
    expect(onCountChange).toHaveBeenCalledTimes(1);
    expect(onCountChange.mock.calls[0][0](2)).toBe(3);
    expect(screen.getByPlaceholderText("Write a comment…")).toHaveValue("");
  });

  it("ignores a blank comment", async () => {
    renderList();
    await screen.findByText("Love it");
    await userEvent.type(screen.getByPlaceholderText("Write a comment…"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(api.addComment).not.toHaveBeenCalled();
  });

  it("lets signed-out visitors read but not write", async () => {
    renderList(false);
    expect(await screen.findByText("Love it")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Write a comment…")).not.toBeInTheDocument();
  });

  it("shows the server's message if posting fails, keeping the draft", async () => {
    api.addComment.mockRejectedValue(new ApiError(403, "Profile not available"));
    renderList();
    await screen.findByText("Love it");
    await userEvent.type(screen.getByPlaceholderText("Write a comment…"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText("Profile not available")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write a comment…")).toHaveValue("Hello");
  });

  it("shows a message, not a stuck 'Loading comments…', when the comments can't be loaded", async () => {
    api.comments.mockRejectedValue(new ApiError(403, "Profile not available"));
    renderList();
    expect(await screen.findByText("Profile not available")).toBeInTheDocument();
    expect(screen.queryByText("Loading comments…")).not.toBeInTheDocument();
  });

  it("pages: shows more comments after the last one loaded, until there are no more", async () => {
    api.comments.mockResolvedValueOnce({ comments: [comment("c1", "Zoe", "Love it")], hasMore: true });
    api.comments.mockResolvedValueOnce({ comments: [comment("c2", "Kai", "Nice colors")], hasMore: false });
    renderList();
    await userEvent.click(await screen.findByRole("button", { name: "Show more comments" }));
    expect(api.comments).toHaveBeenLastCalledWith("p1", "c1");
    expect(await screen.findByText("Nice colors")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more comments" })).not.toBeInTheDocument();
  });

  it("offers Edit only on your own comments, and saves the change with an (edited) mark", async () => {
    api.comments.mockResolvedValue({ comments: [comment("c1", "Zoe", "Love it"), { ...comment("me", "Me", "Mine"), author: { id: "me", username: "me", displayName: "Me" } as User }] });
    api.updateComment.mockResolvedValue({ comment: { ...comment("me", "Me", "Mine, changed"), author: { id: "me", username: "me", displayName: "Me" } as User, editedAt: "2026-05-01T00:00:00.000Z" } });
    renderList();
    await screen.findByText("Love it");
    expect(screen.getAllByRole("button", { name: /^Edit your comment/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /^Edit your comment/ }));
    const box = screen.getByLabelText("Edit comment");
    await userEvent.clear(box);
    await userEvent.type(box, "Mine, changed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.updateComment).toHaveBeenCalledWith("me", "Mine, changed");
    expect(await screen.findByText("Mine, changed")).toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });
});
