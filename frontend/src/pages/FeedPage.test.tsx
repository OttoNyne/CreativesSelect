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
  postsApi: { feed: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(), comments: vi.fn(), addComment: vi.fn(), removeComment: vi.fn() },
}));
vi.mock("../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../components/bulletins/BulletinsStrip", () => ({ BulletinsStrip: () => <div>bulletins strip</div> }));
vi.mock("../components/onboarding/WelcomeChecklist", () => ({ WelcomeChecklist: () => <div>welcome checklist</div> }));
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
  it("shows the getting-started checklist above the posts", async () => {
    api.feed.mockResolvedValue({ posts: [] });
    renderPage();
    expect(await screen.findByText("welcome checklist")).toBeInTheDocument();
  });

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

  it("shows older posts after the oldest one on the page, until there are none", async () => {
    api.feed.mockResolvedValueOnce({ posts: [post({ id: "p2", content: "Newer one" })], hasMore: true });
    api.feed.mockResolvedValueOnce({ posts: [post({ id: "p1", content: "Older one" })], hasMore: false });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show older posts" }));
    expect(api.feed).toHaveBeenLastCalledWith("p2");
    expect(await screen.findByText("Older one")).toBeInTheDocument();
    expect(screen.getByText("Newer one")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show older posts" })).not.toBeInTheDocument();
  });

  it("shows the message, keeping the posts, if older posts can't be loaded", async () => {
    api.feed.mockResolvedValueOnce({ posts: [post({ id: "p2", content: "Newer one" })], hasMore: true });
    api.feed.mockRejectedValueOnce(new ApiError(500, "Internal server error"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show older posts" }));
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
    expect(screen.getByText("Newer one")).toBeInTheDocument();
  });
});

describe("FeedPage: the background", () => {
  const signedInAs = (over: Record<string, unknown>) =>
    vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "me", displayName: "Me", theme: {}, wallpaperType: "image", wallpaperPosition: "50% 50%", ...over } as never, isLoading: false, setUser: () => {}, refresh: async () => {} });
  const frame = () => document.querySelector("[data-scheme]") as HTMLElement | null;

  it("is the usual page for someone who hasn't chosen a background", async () => {
    api.feed.mockResolvedValue({ posts: [] });
    renderPage();
    await screen.findByText(/No posts yet/);
    expect(frame()).toBeNull();
  });

  it("is the same colour they chose for their profile", async () => {
    signedInAs({ theme: { bgColor: "#102040" } });
    api.feed.mockResolvedValue({ posts: [post()] });
    renderPage();
    expect(await screen.findByText("First post")).toBeInTheDocument();
    expect(frame()).not.toBeNull();
    expect(frame()!.style.getPropertyValue("--profile-bg")).toBe("#102040");
    expect(frame()!).toContainElement(screen.getByText("First post"));
    expect(frame()!).toContainElement(screen.getByText("welcome checklist"));
  });

  it("is the same wallpaper they chose for their profile, and keeps the text readable on it", async () => {
    signedInAs({ wallpaperUrl: "https://cdn.example.com/w.jpg" });
    api.feed.mockResolvedValue({ posts: [] });
    renderPage();
    await screen.findByText(/No posts yet/);
    expect(frame()).toHaveAttribute("data-wallpaper", "true");
    expect(frame()!.style.backgroundImage).toContain("https://cdn.example.com/w.jpg");
  });

  it("flips for a bright colour, as the profile does", async () => {
    signedInAs({ theme: { bgColor: "#ffffff" } });
    api.feed.mockResolvedValue({ posts: [] });
    renderPage();
    await screen.findByText(/No posts yet/);
    expect(frame()).toHaveAttribute("data-scheme", "light");
  });

  it("keeps the feed's own font, taking only the background from the profile", async () => {
    signedInAs({ theme: { bgColor: "#102040", fontFamily: "Georgia, serif" } });
    api.feed.mockResolvedValue({ posts: [] });
    renderPage();
    await screen.findByText(/No posts yet/);
    expect(frame()!.style.fontFamily).toBe("");
  });

  it("shows the problem plainly if the feed can't load, whatever the background", async () => {
    signedInAs({ theme: { bgColor: "#102040" } });
    api.feed.mockRejectedValue(new ApiError(500, "boom"));
    renderPage();
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
