import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PostPage } from "./PostPage";
import { postsApi } from "../api/posts.api";
import { ApiError } from "../api/client";
import type { Post, User } from "../types";

vi.mock("../api/posts.api", () => ({ postsApi: { get: vi.fn(), comments: vi.fn(), addComment: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "me", username: "me" }, isLoading: false, setUser: vi.fn(), refresh: vi.fn() }) }));
const api = vi.mocked(postsApi);

const ada = { id: "u1", username: "ada", displayName: "Ada" } as User;
const post = { id: "p1", authorId: "u1", author: ada, content: "My new sketch", imageUrl: null, isAiText: false, isAiImage: false, createdAt: new Date().toISOString(), commentCount: 2 } as Post;
const comment = (id: string, text: string) => ({ id, content: text, createdAt: "", author: { id: "x" + id, username: "bob", displayName: "Bob" } as User });

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/posts/:id" element={<PostPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.comments.mockResolvedValue({ comments: [comment("c1", "First!"), comment("c2", "Lovely colours")] });
});

describe("PostPage", () => {
  it("loads the post and shows it with its comments already open", async () => {
    api.get.mockResolvedValue({ post });
    renderAt("/posts/p1");
    expect(await screen.findByText("My new sketch")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("Lovely colours")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to your feed" })).toHaveAttribute("href", "/");
  });

  it("points at the comment the notification was about", async () => {
    api.get.mockResolvedValue({ post });
    renderAt("/posts/p1?comment=c2");
    const target = (await screen.findByText("Lovely colours")).closest("[id^='comment-']") as HTMLElement;
    expect(target.id).toBe("comment-c2");
    expect(target).toHaveAttribute("aria-current", "true");
    expect(document.getElementById("comment-c1")).not.toHaveAttribute("aria-current");
  });

  it("copes with a comment id that isn't there (it was deleted)", async () => {
    api.get.mockResolvedValue({ post });
    renderAt("/posts/p1?comment=gone");
    expect(await screen.findByText("First!")).toBeInTheDocument();
    expect(document.querySelector("[aria-current='true']")).toBeNull();
  });

  it("says plainly when the post isn't available, without saying why", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Post not found"));
    renderAt("/posts/p1");
    expect(await screen.findByRole("alert")).toHaveTextContent("This post isn't available");
  });

  it("shows a different message when it simply failed to load", async () => {
    api.get.mockRejectedValue(new TypeError("offline"));
    renderAt("/posts/p1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this post");
  });

  it("shows a loading state first", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderAt("/posts/p1");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
