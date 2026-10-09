import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PostCard } from "./PostCard";
import { useAuth } from "../../context/AuthContext";
import { postsApi } from "../../api/posts.api";
import type { Post, User } from "../../types";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/posts.api", () => ({ postsApi: { update: vi.fn(), react: vi.fn(), pin: vi.fn(), unpin: vi.fn() } }));
vi.mock("../../api/saves.api", () => ({ savesApi: { save: vi.fn(), unsave: vi.fn(), list: vi.fn() } }));
vi.mock("./PostCommentList", () => ({ PostCommentList: () => <div>comments</div> }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));

const ada = { id: "u1", username: "ada", displayName: "Ada", isPrivate: false } as User;
const post = (over: Partial<Post> = {}): Post => ({ id: "p1", authorId: "u1", author: ada, content: "Sketching", imageUrl: null, isAiText: false, isAiImage: false, commentCount: 0, createdAt: new Date().toISOString(), ...over }) as Post;

function show(p: Post, viewer: string, onPinChange?: (pinned: boolean) => void) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: viewer, username: "viewer" } as User, isLoading: false, setUser: () => {}, refresh: async () => {} });
  render(
    <MemoryRouter>
      <PostCard post={p} onPinChange={onPinChange} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(postsApi.pin).mockReset().mockResolvedValue({ pinned: true });
  vi.mocked(postsApi.unpin).mockReset().mockResolvedValue(undefined as never);
});

describe("pinning a post", () => {
  it("lets its author pin it and take it down again, and tells whoever is listening", async () => {
    const onPinChange = vi.fn();
    show(post(), "u1", onPinChange);
    await userEvent.click(screen.getByRole("button", { name: "Pin this post to the top of your profile" }));
    expect(postsApi.pin).toHaveBeenCalledWith("p1");
    expect(onPinChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole("button", { name: "Take this post off the top of your profile" }));
    expect(postsApi.unpin).toHaveBeenCalledWith("p1");
    expect(onPinChange).toHaveBeenLastCalledWith(false);
  });

  it("shows a pinned post as pinned", () => {
    show(post({ pinned: true }), "u1");
    expect(screen.getByRole("button", { name: "Take this post off the top of your profile" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers nobody else a Pin button", () => {
    show(post(), "u9");
    expect(screen.queryByRole("button", { name: /top of your profile/ })).toBeNull();
  });
});
