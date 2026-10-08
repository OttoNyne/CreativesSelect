import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ChallengePage } from "./ChallengePage";
import { challengesApi } from "../api/challenges.api";
import { mediaApi } from "../api/media.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { ChallengeEntry, MediaItem, User } from "../types";

vi.mock("../api/challenges.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/challenges.api")>()),
  challengesApi: { current: vi.fn(), entries: vi.fn(), enter: vi.fn(), withdraw: vi.fn() },
}));
vi.mock("../api/media.api", () => ({ mediaApi: { byUser: vi.fn(), react: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));

const api = vi.mocked(challengesApi);
const media = vi.mocked(mediaApi);
const week = { key: "2026-W41", startsAt: "2026-10-05T00:00:00Z", endsAt: "2026-10-12T00:00:00Z", prompt: "Reflection" };
const previous = { key: "2026-W40", startsAt: "2026-09-28T00:00:00Z", endsAt: "2026-10-05T00:00:00Z", prompt: "Night market" };
const reactions = { counts: {}, total: 0, mine: null };
const piece = (id: string, caption: string | null = null) => ({ id, ownerId: "o", url: `https://img.example.com/${id}.png`, type: "image", caption, isAiImage: false, reactions, createdAt: "" }) as unknown as MediaItem;
const entry = (id: string, username: string, caption: string | null = `by ${username}`): ChallengeEntry => ({ id, item: piece(`m-${id}`, caption), owner: { id: `u-${username}`, username, displayName: username.toUpperCase(), avatarUrl: null, csVerified: false }, createdAt: "2026-10-06T10:00:00Z" });
const me = { id: "me", username: "me", displayName: "Me", isPrivate: false } as User;

function show(viewer: User | null = me) {
  vi.mocked(useAuth).mockReturnValue({ user: viewer, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter>
      <ChallengePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  [api.current, api.entries, api.enter, api.withdraw, media.byUser, media.react].forEach((fn) => fn.mockReset());
  api.current.mockResolvedValue({ week, previous, entryCount: 2, mine: null });
  api.entries.mockImplementation(async (key) => ({ week, entries: key === previous.key ? [] : [entry("e1", "ann"), entry("e2", "ben")], total: key === previous.key ? 0 : 2, hasMore: false }));
  media.byUser.mockResolvedValue({ media: [piece("p1", "A vase"), piece("p2")] });
});

describe("ChallengePage", () => {
  it("shows this week's prompt, when it closes and how many have entered, and the gallery with who made each piece", async () => {
    show();
    expect(await screen.findByText("Reflection")).toBeInTheDocument();
    expect(screen.getByText(/Open until October 11, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/2 entries so far/)).toBeInTheDocument();
    const gallery = screen.getByRole("region", { name: "Gallery" });
    expect(await within(gallery).findByRole("link", { name: /by ANN/ })).toHaveAttribute("href", "/u/ann");
    expect(within(gallery).getByRole("link", { name: /by BEN/ })).toHaveAttribute("href", "/u/ben");
  });

  it("says plainly when last week had no entries, and when this week has none", async () => {
    api.current.mockResolvedValue({ week, previous, entryCount: 0, mine: null });
    api.entries.mockResolvedValue({ week, entries: [], total: 0, hasMore: false });
    show();
    expect(await screen.findByText("No one entered last week.")).toBeInTheDocument();
    expect(screen.getByText("No one has entered yet. Be the first!")).toBeInTheDocument();
  });

  it("shows last week's most loved above this week's gallery", async () => {
    api.entries.mockImplementation(async (key) => ({ week, entries: key === previous.key ? [entry("w1", "winner")] : [entry("e1", "ann")], total: 1, hasMore: false }));
    show();
    const last = await screen.findByRole("region", { name: "Most loved last week" });
    expect(await within(last).findByRole("link", { name: /by WINNER/ })).toBeInTheDocument();
    expect(within(last).getByText("Last week: Night market")).toBeInTheDocument();
    expect(api.entries).toHaveBeenCalledWith("2026-W40", expect.objectContaining({ sort: "top", limit: 3 }));
  });

  it("lets a signed-in person choose one of their pieces and enter it, and tells them", async () => {
    api.enter.mockResolvedValue({ entry: { id: "mine", item: piece("p1", "A vase") } });
    show();
    const choice = await screen.findByRole("combobox", { name: "Choose a piece to enter" });
    await waitFor(() => expect(within(choice).getAllByRole("option")).toHaveLength(3));
    expect(screen.getByRole("button", { name: "Enter the challenge" })).toBeDisabled();
    await userEvent.selectOptions(choice, "p1");
    await userEvent.click(screen.getByRole("button", { name: "Enter the challenge" }));
    expect(api.enter).toHaveBeenCalledWith("p1");
    expect(await screen.findByRole("status")).toHaveTextContent("You're in!");
    expect(screen.getByRole("region", { name: "Your entry this week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(screen.getByText(/3 entries so far/)).toBeInTheDocument();
  });

  it("says why an entry couldn't be made and lets them try again", async () => {
    api.enter.mockRejectedValue(new ApiError(409, "You've already entered this week's challenge"));
    show();
    const choice = await screen.findByRole("combobox", { name: "Choose a piece to enter" });
    await waitFor(() => expect(within(choice).getAllByRole("option")).toHaveLength(3));
    await userEvent.selectOptions(choice, "p2");
    await userEvent.click(screen.getByRole("button", { name: "Enter the challenge" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've already entered this week's challenge");
    expect(screen.getByRole("button", { name: "Enter the challenge" })).toBeEnabled();
  });

  it("shows someone who has entered their entry, and lets them withdraw it", async () => {
    api.current.mockResolvedValue({ week, previous, entryCount: 3, mine: { id: "mine", item: piece("p1", "A vase") } });
    api.withdraw.mockResolvedValue(undefined as never);
    show();
    expect(await screen.findByRole("region", { name: "Your entry this week" })).toHaveTextContent("A vase");
    expect(screen.queryByRole("combobox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(api.withdraw).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Your entry was withdrawn.");
    expect(await screen.findByRole("combobox", { name: "Choose a piece to enter" })).toBeInTheDocument();
  });

  it("sends someone with no pieces to their profile, and explains to someone with a private profile", async () => {
    media.byUser.mockResolvedValue({ media: [] });
    show();
    expect(await screen.findByText(/You have no pieces yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my profile" })).toHaveAttribute("href", "/u/me");
  });

  it("tells someone with a private profile to make it public", async () => {
    show({ ...me, isPrivate: true });
    expect(await screen.findByText(/Your profile is private/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("invites someone who isn't signed in to join, and shows them the gallery anyway", async () => {
    show(null);
    expect(await screen.findByText(/Sign up or log in to enter a piece/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(await screen.findByRole("link", { name: /by ANN/ })).toBeInTheDocument();
    expect(media.byUser).not.toHaveBeenCalled();
  });

  it("orders the gallery by most loved, and shows more when there is more", async () => {
    api.entries.mockImplementation(async (key, options) => {
      if (key === previous.key) return { week, entries: [], total: 0, hasMore: false };
      if (options.sort === "top") return { week, entries: [entry("t1", "topone")], total: 1, hasMore: false };
      if (options.page === 2) return { week, entries: [entry("e3", "cat")], total: 25, hasMore: false };
      return { week, entries: Array.from({ length: 24 }, (_, i) => entry(`n${i}`, `user${i}`)), total: 25, hasMore: true };
    });
    show(null);
    const more = await screen.findByRole("button", { name: "Show more" });
    await userEvent.click(more);
    expect(await screen.findByRole("link", { name: /by CAT/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Most loved" }));
    expect(await screen.findByRole("link", { name: /by TOPONE/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Most loved" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("link", { name: /by USER0/ })).toBeNull();
  });

  it("says when the challenge couldn't be loaded", async () => {
    api.current.mockRejectedValue(new ApiError(500, "Server error"));
    show(null);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
  });
});
