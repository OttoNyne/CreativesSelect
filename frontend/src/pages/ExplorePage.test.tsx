import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ExplorePage, cleanTag } from "./ExplorePage";
import { exploreApi } from "../api/explore.api";
import { topicsApi } from "../api/topics.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { ChallengeEntry, MediaItem, Post, User } from "../types";

vi.mock("../api/explore.api", () => ({ exploreApi: { list: vi.fn(), trending: vi.fn() } }));
vi.mock("../api/topics.api", () => ({ topicsApi: { list: vi.fn(), follow: vi.fn(), unfollow: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../components/post/PostCard", () => ({ PostCard: ({ post }: { post: Post }) => <article>{post.content}</article> }));
vi.mock("../components/challenge/ChallengeTile", () => ({
  ChallengeTile: ({ entry, canReact }: { entry: ChallengeEntry; canReact: boolean }) => (
    <li>
      {entry.item.caption} {canReact ? "(can react)" : "(read only)"}
    </li>
  ),
}));

const api = vi.mocked(exploreApi);
const post = (id: string, content: string) => ({ id, content }) as unknown as Post;
const piece = (id: string, caption: string) => ({ id, item: { id: `m${id}`, caption } as MediaItem, owner: { id: "o", username: "o", displayName: "O", avatarUrl: null, csVerified: false }, createdAt: "" }) as ChallengeEntry;

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}
function show(start = "/explore", signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? ({ id: "me" } as User) : null, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={[start]}>
      <ExplorePage />
      <Where />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(topicsApi.list).mockReset().mockResolvedValue({ topics: [] });
  vi.mocked(topicsApi.follow).mockReset().mockResolvedValue({ following: true });
  vi.mocked(topicsApi.unfollow).mockReset().mockResolvedValue(undefined as never);
  api.list.mockReset();
  api.trending.mockReset();
  api.trending.mockResolvedValue({
    tags: [
      { tag: "pots", people: 3, uses: 5 },
      { tag: "glass", people: 1, uses: 1 },
    ],
    days: 7,
  });
  api.list.mockResolvedValue({ type: "posts", tag: null, posts: [post("1", "First post"), post("2", "Second post")], hasMore: false, next: null });
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
});

describe("cleanTag", () => {
  it("turns what was typed into a tag or nothing", () => {
    expect(cleanTag("#Ceramics")).toBe("ceramics");
    expect(cleanTag(" café ")).toBe("café");
    for (const bad of [null, "", "#", "a", "12", "two words", "<b>"]) expect(cleanTag(bad), String(bad)).toBeNull();
  });
});

describe("ExplorePage", () => {
  it("shows the latest posts and the topics trending this week, to someone who isn't signed in too", async () => {
    show("/explore", false);
    expect(await screen.findByText("First post")).toBeInTheDocument();
    expect(screen.getByText("Second post")).toBeInTheDocument();
    const trending = screen.getByRole("region", { name: "Trending this week" });
    expect(await within(trending).findByRole("link", { name: /#pots/ })).toHaveAttribute("href", "/explore?tag=pots");
    expect(within(trending).getByRole("link", { name: /#pots/ })).toHaveTextContent("3 people");
    expect(within(trending).getByRole("link", { name: /#glass/ })).toHaveTextContent("1 person");
    expect(api.list).toHaveBeenCalledWith({ type: "posts", tag: null });
    expect(screen.getByRole("link", { name: "See this week's creative challenge" })).toHaveAttribute("href", "/challenge");
  });

  it("asks search engines to keep out of the page", async () => {
    show();
    await screen.findByText("First post");
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow"));
  });

  it("shows what is about a topic from the address, and can clear it", async () => {
    api.list.mockResolvedValue({ type: "posts", tag: "pots", posts: [post("3", "A pots post")], hasMore: false, next: null });
    show("/explore?tag=Pots");
    expect(await screen.findByText("A pots post")).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({ type: "posts", tag: "pots" });
    expect(screen.getByText("About #pots")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search a topic" })).toHaveValue("pots");
    await userEvent.click(screen.getByRole("button", { name: "Show everything" }));
    expect(screen.getByTestId("where").textContent).not.toContain("tag=");
  });

  it("searches a topic, with or without the #", async () => {
    show();
    await screen.findByText("First post");
    await userEvent.type(screen.getByRole("textbox", { name: "Search a topic" }), "#Glass{Enter}");
    expect(screen.getByTestId("where")).toHaveTextContent("/explore?tag=glass");
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ type: "posts", tag: "glass" }));
  });

  it("says plainly when what was typed can't be a topic, and doesn't search", async () => {
    show();
    await screen.findByText("First post");
    await userEvent.type(screen.getByRole("textbox", { name: "Search a topic" }), "two words{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("A topic is one word of letters, numbers or underscores.");
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("switches to pieces, keeping the topic, and tells a visitor they can't react", async () => {
    api.list.mockImplementation(async ({ type }) => (type === "pieces" ? { type, tag: "pots", pieces: [piece("a", "A vase")], hasMore: false, next: null } : { type, tag: "pots", posts: [post("3", "A pots post")], hasMore: false, next: null }));
    show("/explore?tag=pots", false);
    await screen.findByText("A pots post");
    await userEvent.click(screen.getByRole("button", { name: "Pieces" }));
    expect(await screen.findByText(/A vase/)).toHaveTextContent("(read only)");
    expect(screen.getByRole("button", { name: "Pieces" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("where")).toHaveTextContent("/explore?tag=pots&type=pieces");
    expect(api.list).toHaveBeenLastCalledWith({ type: "pieces", tag: "pots" });
  });

  it("shows more with the cursor, without repeating what is already there", async () => {
    api.list.mockResolvedValueOnce({ type: "posts", tag: null, posts: [post("1", "First post")], hasMore: true, next: "cursor1" });
    api.list.mockResolvedValueOnce({ type: "posts", tag: null, posts: [post("1", "First post"), post("2", "Second post")], hasMore: false, next: null });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(api.list).toHaveBeenLastCalledWith({ type: "posts", tag: null, before: "cursor1" });
    expect(await screen.findByText("Second post")).toBeInTheDocument();
    expect(screen.getAllByText("First post")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("says when there is nothing, and when nothing is trending", async () => {
    api.trending.mockResolvedValue({ tags: [], days: 7 });
    api.list.mockResolvedValue({ type: "posts", tag: null, posts: [], hasMore: false, next: null });
    show();
    expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
    expect(await screen.findByText(/No topics yet this week/)).toBeInTheDocument();
  });

  it("says when nothing is about the topic", async () => {
    api.list.mockResolvedValue({ type: "posts", tag: "rare", posts: [], hasMore: false, next: null });
    show("/explore?tag=rare");
    expect(await screen.findByText("Nothing about #rare yet. Be the first!")).toBeInTheDocument();
  });

  it("says when it couldn't load", async () => {
    api.list.mockRejectedValue(new ApiError(429, "You're looking around too fast — try again in a bit"));
    api.trending.mockRejectedValue(new Error("down"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("looking around too fast");
  });
});

describe("ExplorePage: topics you follow", () => {
  it("says so when none are followed, and lists the ones that are, linking to each", async () => {
    show();
    expect(await screen.findByText("You aren't following any topics yet. Open a topic and follow it.")).toBeInTheDocument();
    cleanup();
    vi.mocked(topicsApi.list).mockResolvedValue({ topics: ["clay", "glaze"] });
    show();
    expect(await screen.findByRole("link", { name: "#clay" })).toHaveAttribute("href", "/explore?tag=clay");
    expect(screen.getByRole("link", { name: "#glaze" })).toBeInTheDocument();
  });

  it("follows a topic from its page, and stops following it", async () => {
    show("/explore?tag=clay");
    await userEvent.click(await screen.findByRole("button", { name: "Follow the topic clay" }));
    expect(topicsApi.follow).toHaveBeenCalledWith("clay");
    const stop = await screen.findByRole("button", { name: "Stop following the topic clay" });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(stop);
    expect(topicsApi.unfollow).toHaveBeenCalledWith("clay");
    expect(await screen.findByRole("button", { name: "Follow the topic clay" })).toBeInTheDocument();
  });

  it("says why a topic couldn't be followed", async () => {
    vi.mocked(topicsApi.follow).mockRejectedValue(new ApiError(400, "You can follow up to 30 topics — unfollow one first"));
    show("/explore?tag=clay");
    await userEvent.click(await screen.findByRole("button", { name: "Follow the topic clay" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 30 topics");
  });

  it("shows only what is about your topics when asked, and says so when there is nothing", async () => {
    vi.mocked(topicsApi.list).mockResolvedValue({ topics: ["clay"] });
    show();
    await screen.findByRole("link", { name: "#clay" });
    api.list.mockResolvedValue({ type: "posts", tag: null, posts: [], hasMore: false, next: null });
    await userEvent.click(screen.getByRole("button", { name: "From your topics" }));
    expect(api.list).toHaveBeenLastCalledWith({ type: "posts", tag: null, mine: true });
    expect(screen.getByTestId("where")).toHaveTextContent("/explore?mine=1");
    expect(await screen.findByText("Nothing new in your topics yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Everything" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/explore");
  });

  it("offers a visitor who is not signed in none of this", async () => {
    show("/explore?tag=clay", false);
    await screen.findByText(/First post/);
    expect(screen.queryByRole("button", { name: /Follow the topic/ })).toBeNull();
    expect(screen.queryByText("Your topics")).toBeNull();
    expect(topicsApi.list).not.toHaveBeenCalled();
  });
});
