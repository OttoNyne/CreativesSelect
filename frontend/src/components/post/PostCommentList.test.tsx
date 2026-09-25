import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostCommentList } from "./PostCommentList";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../api/posts.api", () => ({ postsApi: { comments: vi.fn(), addComment: vi.fn() } }));
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
    expect(onCountChange).toHaveBeenCalledWith(3);
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
});
