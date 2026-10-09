import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedPage } from "./SavedPage";
import { savesApi } from "../api/saves.api";
import { ApiError } from "../api/client";
import type { ChallengeEntry, Post } from "../types";

vi.mock("../api/saves.api", () => ({ savesApi: { list: vi.fn(), save: vi.fn(), unsave: vi.fn() } }));
vi.mock("../components/post/PostCard", () => ({
  PostCard: ({ post, onSavedChange }: { post: Post; onSavedChange?: (saved: boolean) => void }) => (
    <article>
      {post.content}
      <button onClick={() => onSavedChange?.(false)}>unsave {post.id}</button>
    </article>
  ),
}));
vi.mock("../components/challenge/ChallengeTile", () => ({
  ChallengeTile: ({ entry, onSavedChange }: { entry: ChallengeEntry; onSavedChange?: (saved: boolean) => void }) => (
    <li>
      {entry.item.caption}
      <button onClick={() => onSavedChange?.(false)}>unsave piece {entry.id}</button>
    </li>
  ),
}));

const api = vi.mocked(savesApi);
const post = (id: string, content: string) => ({ id, content }) as unknown as Post;
const piece = (id: string, caption: string) => ({ id, item: { id: `m${id}`, caption }, owner: {}, createdAt: "" }) as unknown as ChallengeEntry;

beforeEach(() => {
  api.list.mockReset();
  api.list.mockResolvedValue({ type: "posts", posts: [post("1", "Saved post one"), post("2", "Saved post two")], hasMore: false, next: null });
});

describe("SavedPage", () => {
  it("shows the saved posts, and says the list is private", async () => {
    render(<SavedPage />);
    expect(await screen.findByText(/Saved post one/)).toBeInTheDocument();
    expect(screen.getByText(/Saved post two/)).toBeInTheDocument();
    expect(screen.getByText("Posts and pieces you saved. Only you can see this list.")).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith("posts");
  });
  it("takes a post off the page when it is unsaved there", async () => {
    render(<SavedPage />);
    await userEvent.click(await screen.findByRole("button", { name: "unsave 1" }));
    expect(screen.queryByText(/Saved post one/)).toBeNull();
    expect(screen.getByText(/Saved post two/)).toBeInTheDocument();
  });
  it("switches to pieces, and takes one off when it is unsaved", async () => {
    api.list.mockImplementation(async (type) => (type === "pieces" ? { type, pieces: [piece("a", "A saved vase"), piece("b", "A saved bowl")], hasMore: false, next: null } : { type, posts: [], hasMore: false, next: null }));
    render(<SavedPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Pieces" }));
    expect(await screen.findByText(/A saved vase/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pieces" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "unsave piece a" }));
    expect(screen.queryByText(/A saved vase/)).toBeNull();
    expect(screen.getByText(/A saved bowl/)).toBeInTheDocument();
  });
  it("says so when nothing is saved", async () => {
    api.list.mockResolvedValue({ type: "posts", posts: [], hasMore: false, next: null });
    render(<SavedPage />);
    expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
  });
  it("shows more with the cursor, without repeating", async () => {
    api.list.mockResolvedValueOnce({ type: "posts", posts: [post("1", "Saved post one")], hasMore: true, next: "c1" });
    api.list.mockResolvedValueOnce({ type: "posts", posts: [post("1", "Saved post one"), post("2", "Saved post two")], hasMore: false, next: null });
    render(<SavedPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(api.list).toHaveBeenLastCalledWith("posts", "c1");
    expect(await screen.findByText(/Saved post two/)).toBeInTheDocument();
    expect(screen.getAllByText(/Saved post one/)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show more" })).toBeNull());
  });
  it("says when it couldn't load", async () => {
    api.list.mockRejectedValue(new ApiError(500, "Server error"));
    render(<SavedPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
  });
});
