import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PostCard } from "./PostCard";
import { useAuth } from "../../context/AuthContext";
import { postsApi } from "../../api/posts.api";
import { savesApi } from "../../api/saves.api";
import { ApiError } from "../../api/client";
import type { Post, User } from "../../types";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/posts.api", () => ({ postsApi: { update: vi.fn(), react: vi.fn(), repost: vi.fn() } }));
vi.mock("../../api/saves.api", () => ({ savesApi: { save: vi.fn(), unsave: vi.fn(), list: vi.fn() } }));
vi.mock("./PostCommentList", () => ({ PostCommentList: () => <div>comments</div> }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));

const ada = { id: "u1", username: "ada", displayName: "Ada Lovelace", isPrivate: false } as User;
const ben = { id: "u2", username: "ben", displayName: "Ben Sharer", isPrivate: false } as User;
const post = (over: Partial<Post> = {}): Post => ({ id: "p1", authorId: "u1", author: ada, content: "Sketching all day", imageUrl: null, isAiText: false, isAiImage: false, commentCount: 0, createdAt: new Date().toISOString(), ...over }) as Post;
const original = { available: true as const, id: "orig1", authorId: "u1", author: ada, content: "The original words", imageUrl: null, createdAt: new Date().toISOString() };

function show(p: Post, viewer: string | null = "u9", onSavedChange?: (saved: boolean) => void) {
  vi.mocked(useAuth).mockReturnValue({ user: viewer ? ({ id: viewer, username: "viewer" } as User) : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  render(
    <MemoryRouter>
      <PostCard post={p} onSavedChange={onSavedChange} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(savesApi.save).mockReset().mockResolvedValue({ saved: true });
  vi.mocked(savesApi.unsave).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(postsApi.repost).mockReset().mockResolvedValue({ post: {} as Post });
});

describe("saving a post", () => {
  it("saves and unsaves, and tells whoever is listening", async () => {
    const onSavedChange = vi.fn();
    show(post(), "u9", onSavedChange);
    await userEvent.click(screen.getByRole("button", { name: "Save this post" }));
    expect(savesApi.save).toHaveBeenCalledWith("posts", "p1");
    const on = await screen.findByRole("button", { name: "Remove this post from your saved list" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(on).toHaveTextContent("Saved");
    await userEvent.click(on);
    expect(savesApi.unsave).toHaveBeenCalledWith("posts", "p1");
    expect(await screen.findByRole("button", { name: "Save this post" })).toHaveAttribute("aria-pressed", "false");
    expect(onSavedChange.mock.calls).toEqual([[true], [false]]);
  });
  it("starts as saved when it already is", () => {
    show(post({ saved: true }));
    expect(screen.getByRole("button", { name: "Remove this post from your saved list" })).toHaveAttribute("aria-pressed", "true");
  });
  it("says why it couldn't be saved", async () => {
    vi.mocked(savesApi.save).mockRejectedValue(new ApiError(400, "You can save up to 2000 things — remove some first"));
    show(post());
    await userEvent.click(screen.getByRole("button", { name: "Save this post" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 2000 things");
    expect(screen.getByRole("button", { name: "Save this post" })).toHaveAttribute("aria-pressed", "false");
  });
  it("is offered to the owner too", () => {
    show(post(), "u1");
    expect(screen.getByRole("button", { name: "Save this post" })).toBeInTheDocument();
  });
  it("isn't offered when signed out", () => {
    show(post(), null);
    expect(screen.queryByRole("button", { name: /Save this post/ })).toBeNull();
  });
});

describe("sharing a post", () => {
  it("shares it with words of your own, and says so", async () => {
    show(post());
    await userEvent.click(screen.getByRole("button", { name: "Share this post to your feed" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Add your own words (optional)" }), "Look at this");
    await userEvent.click(screen.getByRole("button", { name: "Share to my feed" }));
    expect(postsApi.repost).toHaveBeenCalledWith("p1", "Look at this");
    expect(await screen.findByRole("status")).toHaveTextContent("Shared to your feed.");
    expect(screen.getByRole("button", { name: "Share this post to your feed" })).toBeDisabled();
  });
  it("shares it without any words, and can be cancelled", async () => {
    show(post());
    await userEvent.click(screen.getByRole("button", { name: "Share this post to your feed" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Add your own words (optional)" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Share this post to your feed" }));
    await userEvent.click(screen.getByRole("button", { name: "Share to my feed" }));
    expect(postsApi.repost).toHaveBeenCalledWith("p1", "");
  });
  it("says why it couldn't be shared and lets them try again", async () => {
    vi.mocked(postsApi.repost).mockRejectedValue(new ApiError(409, "You've already shared this post"));
    show(post());
    await userEvent.click(screen.getByRole("button", { name: "Share this post to your feed" }));
    await userEvent.click(screen.getByRole("button", { name: "Share to my feed" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've already shared this post");
    expect(screen.getByRole("button", { name: "Share to my feed" })).toBeEnabled();
  });
  it("isn't offered on your own post", () => {
    show(post(), "u1");
    expect(screen.queryByRole("button", { name: "Share this post to your feed" })).toBeNull();
  });
  it("isn't offered on a private profile's post", () => {
    show(post({ author: { ...ada, isPrivate: true } as User }));
    expect(screen.queryByRole("button", { name: "Share this post to your feed" })).toBeNull();
  });
  it("isn't offered when signed out", () => {
    show(post(), null);
    expect(screen.queryByRole("button", { name: "Share this post to your feed" })).toBeNull();
  });
});

describe("a post that shares another", () => {
  it("shows who shared it, their words, and the original inside with a link to it", () => {
    show(post({ id: "r1", authorId: "u2", author: ben, content: "Look at this", isRepost: true, repost: original }));
    expect(screen.getByText(/shared a post/)).toBeInTheDocument();
    expect(screen.getByText("Look at this")).toBeInTheDocument();
    expect(screen.getByText("The original words")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the post" })).toHaveAttribute("href", "/posts/orig1");
    expect(screen.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/u/ada");
  });
  it("draws no empty words when it was shared without any", () => {
    show(post({ id: "r1", authorId: "u2", author: ben, content: "", isRepost: true, repost: original }));
    expect(screen.getByText("The original words")).toBeInTheDocument();
    expect(document.querySelectorAll("p").length).toBe(1);
  });
  it("says so when the original isn't available any more", () => {
    show(post({ id: "r1", authorId: "u2", author: ben, content: "", isRepost: true, repost: { available: false } }));
    expect(screen.getByText("This post isn't available any more.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share this post to your feed" })).toBeNull();
  });
  it("can be shared on, and it is the post shown that is sent (the server shares the original)", async () => {
    show(post({ id: "r1", authorId: "u2", author: ben, content: "", isRepost: true, repost: original }), "u9");
    await userEvent.click(screen.getByRole("button", { name: "Share this post to your feed" }));
    await userEvent.click(screen.getByRole("button", { name: "Share to my feed" }));
    expect(postsApi.repost).toHaveBeenCalledWith("r1", "");
  });
  it("is not offered to the author of the original", () => {
    show(post({ id: "r1", authorId: "u2", author: ben, content: "", isRepost: true, repost: original }), "u1");
    expect(screen.queryByRole("button", { name: "Share this post to your feed" })).toBeNull();
  });
});
