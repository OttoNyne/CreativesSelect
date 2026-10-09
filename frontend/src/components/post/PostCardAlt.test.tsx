import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PostCard } from "./PostCard";
import { useAuth } from "../../context/AuthContext";
import { postsApi } from "../../api/posts.api";
import type { Post, User } from "../../types";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/posts.api", () => ({ postsApi: { update: vi.fn(), react: vi.fn(), repost: vi.fn(), setPictureDescription: vi.fn() } }));
vi.mock("../../api/saves.api", () => ({ savesApi: { save: vi.fn(), unsave: vi.fn() } }));
vi.mock("./PostCommentList", () => ({ PostCommentList: () => <div>comments</div> }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));

const ada = { id: "u1", username: "ada", displayName: "Ada Lovelace", isPrivate: false } as User;
const ben = { id: "u2", username: "ben", displayName: "Ben Sharer", isPrivate: false } as User;
const post = (over: Partial<Post> = {}): Post => ({ id: "p1", authorId: "u1", author: ada, content: "Sketching all day", imageUrl: null, isAiText: false, isAiImage: false, commentCount: 0, createdAt: new Date().toISOString(), ...over }) as Post;

function show(p: Post, viewer: string | null = "u9") {
  vi.mocked(useAuth).mockReturnValue({ user: viewer ? ({ id: viewer, username: "viewer" } as User) : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  return render(
    <MemoryRouter>
      <PostCard post={p} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(postsApi.setPictureDescription).mockReset();
});

describe("a post's picture description", () => {
  it("is the picture's alternative text", () => {
    show(post({ imageUrl: "https://cdn.example.com/a.png", imageAspect: "original", imageAlt: "A blue vase on a table" }));
    expect(screen.getByRole("img", { name: "A blue vase on a table" })).toBeInTheDocument();
  });

  it("is in the picture of a shared post too", () => {
    const original = { available: true as const, id: "orig1", authorId: "u1", author: ada, content: "Words", imageUrl: "https://cdn.example.com/o.png", imageAlt: "The original picture", createdAt: new Date().toISOString() };
    show(post({ id: "r1", authorId: "u2", author: ben, content: "", isRepost: true, repost: original }));
    expect(screen.getByRole("img", { name: "The original picture" })).toBeInTheDocument();
  });

  it("lets the owner add one, and then shows it", async () => {
    vi.mocked(postsApi.setPictureDescription).mockResolvedValue({ post: { imageAlt: "Added later" } as Post });
    show(post({ imageUrl: "https://cdn.example.com/a.png", imageAspect: "original", imageAlt: "" }), "u1");
    await userEvent.click(screen.getByRole("button", { name: "Describe picture" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Picture description" }), "Added later");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("img", { name: "Added later" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit picture description" })).toBeInTheDocument();
  });

  it("is only offered to the owner of a post that has a picture", () => {
    const first = show(post({ imageUrl: "https://cdn.example.com/a.png", imageAspect: "original" }), "u9");
    expect(screen.queryByRole("button", { name: "Describe picture" })).toBeNull();
    first.unmount();
    show(post({ imageUrl: null }), "u1");
    expect(screen.queryByRole("button", { name: "Describe picture" })).toBeNull();
  });
});
