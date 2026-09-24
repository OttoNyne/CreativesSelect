import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { FeedPage } from "./FeedPage";
import { postsApi } from "../api/posts.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Post } from "../types";

vi.mock("../api/posts.api", () => ({
  postsApi: { feed: vi.fn(), create: vi.fn(), remove: vi.fn(), comments: vi.fn(), addComment: vi.fn(), removeComment: vi.fn() },
}));
vi.mock("../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../api/ai.api", () => ({ aiApi: { generateText: vi.fn(), generateImage: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(postsApi);

function post(over: Partial<Post> = {}): Post {
  return {
    id: "p1",
    authorId: "me",
    author: { id: "me", username: "me", displayName: "Me" },
    content: "First post",
    imageUrl: null,
    isAiText: false,
    isAiImage: false,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    ...over,
  } as Post;
}

function renderPage() {
  render(
    <MemoryRouter>
      <FeedPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "me", username: "me", displayName: "Me" } as never,
    isLoading: false,
    setUser: () => {},
    refresh: async () => {},
  });
});

describe("FeedPage", () => {
  it("shows the feed, including the AI badges", async () => {
    api.feed.mockResolvedValue({
      posts: [post(), post({ id: "p2", authorId: "u2", author: { id: "u2", username: "zoe", displayName: "Zoe" } as never, content: "Zoe's post", isAiImage: true })],
    });
    renderPage();
    expect(await screen.findByText("First post")).toBeInTheDocument();
    expect(screen.getByText("Zoe's post")).toBeInTheDocument();
    expect(screen.getByText(/AI-generated image/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no posts", async () => {
    api.feed.mockResolvedValue({ posts: [] });
    renderPage();
    expect(await screen.findByText(/No posts yet/)).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    api.feed.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPage();
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });

  it("posts from the composer and puts the new post first", async () => {
    api.feed.mockResolvedValue({ posts: [post()] });
    api.create.mockResolvedValue({ post: post({ id: "p9", content: "Brand new" }) });
    renderPage();
    await screen.findByText("First post");

    await userEvent.type(screen.getByPlaceholderText(/Share what you're working on/), "  Brand new ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(api.create).toHaveBeenCalledWith({ content: "Brand new", imageUrl: null, isAiText: false, isAiImage: false });
    const items = await screen.findAllByText(/First post|Brand new/);
    expect(items[0]).toHaveTextContent("Brand new");
  });

  it("shows the server's error if posting fails and keeps the draft", async () => {
    api.feed.mockResolvedValue({ posts: [] });
    api.create.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPage();
    const box = await screen.findByPlaceholderText(/Share what you're working on/);
    await userEvent.type(box, "Draft text");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
    expect(box).toHaveValue("Draft text");
  });

  it("only offers Delete on my own posts, and removes the post when deleted", async () => {
    api.feed.mockResolvedValue({
      posts: [post(), post({ id: "p2", authorId: "u2", author: { id: "u2", username: "zoe", displayName: "Zoe" } as never, content: "Zoe's post" })],
    });
    api.remove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("First post");

    const deletes = screen.getAllByRole("button", { name: "Delete" });
    expect(deletes).toHaveLength(1);
    await userEvent.click(deletes[0]);

    expect(api.remove).toHaveBeenCalledWith("p1");
    await vi.waitFor(() => expect(screen.queryByText("First post")).not.toBeInTheDocument());
    expect(screen.getByText("Zoe's post")).toBeInTheDocument();
  });

  it("keeps the post and shows a message if deleting fails", async () => {
    api.feed.mockResolvedValue({ posts: [post()] });
    api.remove.mockRejectedValue(new ApiError(403, "Not allowed"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
    expect(screen.getByText("First post")).toBeInTheDocument();
  });
});
