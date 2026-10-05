import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioGrid } from "./PortfolioGrid";
import { mediaApi } from "../../api/media.api";
import { albumsApi } from "../../api/albums.api";
import { moderationApi } from "../../api/moderation.api";
import { useAuth } from "../../context/AuthContext";
import type { Comment, MediaItem, User } from "../../types";

vi.mock("../../api/media.api", () => ({
  mediaApi: { byUser: vi.fn(), react: vi.fn(), comments: vi.fn(), addComment: vi.fn(), updateComment: vi.fn(), removeComment: vi.fn() },
  uploadFile: vi.fn(),
}));
vi.mock("../../api/albums.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/albums.api")>()),
  albumsApi: { byUser: vi.fn() },
}));
vi.mock("../../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(mediaApi);

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name }) as User;
const comment = (id: string, authorId: string, name: string, content: string, over: Partial<Comment> = {}): Comment => ({ id, content, createdAt: "", author: person(authorId, name), ...over }) as Comment;
const piece = (over: Partial<MediaItem> = {}): MediaItem => ({ id: "m1", ownerId: "owner", url: "https://images.example.com/a.jpg", type: "image", caption: "Harbour", isAiImage: false, likes: 0, dislikes: 0, myReaction: 0, commentCount: 2, createdAt: "", ...over });

function renderGrid({ owner = false, signedIn = true, focusPiece = null as string | null, focusComment = null as string | null } = {}) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? person(owner ? "owner" : "me", owner ? "Owner" : "Me") : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  return render(<PortfolioGrid username="owner" isOwner={owner} focusPiece={focusPiece} focusComment={focusComment} />);
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [] });
  vi.mocked(moderationApi.report).mockReset();
  window.confirm = vi.fn(() => true);
  api.byUser.mockResolvedValue({ media: [piece(), piece({ id: "m2", caption: "Market", commentCount: 0 })] });
  api.comments.mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Beautiful light"), comment("c2", "me", "Me", "Thank you!")], hasMore: false });
});

describe("PortfolioGrid: comments on a piece", () => {
  it("shows how many comments each piece has, and opens and closes them", async () => {
    renderGrid();
    expect(await screen.findByRole("button", { name: "Comments (2)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Comments (0)" })).toBeInTheDocument();
    expect(api.comments).not.toHaveBeenCalled(); // nothing is loaded until you look

    await userEvent.click(screen.getByRole("button", { name: "Comments (2)" }));
    expect(await screen.findByText("Beautiful light")).toBeInTheDocument();
    expect(api.comments).toHaveBeenCalledWith("m1");
    expect(screen.getByRole("button", { name: "Comments (2)" })).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: "Comments (2)" }));
    expect(screen.queryByText("Beautiful light")).not.toBeInTheDocument();
  });

  it("keeps one piece's comments open at a time", async () => {
    api.comments.mockImplementation(async (id) => ({ comments: [comment("x" + id, "u-zoe", "Zoe", `on ${id}`)], hasMore: false }));
    renderGrid();
    await userEvent.click(await screen.findByRole("button", { name: "Comments (2)" }));
    expect(await screen.findByText("on m1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Comments (0)" }));
    expect(await screen.findByText("on m2")).toBeInTheDocument();
    expect(screen.queryByText("on m1")).not.toBeInTheDocument();
  });

  it("adds a comment and the piece's count follows", async () => {
    api.addComment.mockResolvedValue({ comment: comment("c3", "me", "Me", "Great piece") });
    renderGrid();
    await userEvent.click(await screen.findByRole("button", { name: "Comments (0)" }));
    await userEvent.type(await screen.findByPlaceholderText("Write a comment…"), "  Great piece ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(api.addComment).toHaveBeenCalledWith("m2", "Great piece");
    expect(await screen.findByText("Great piece")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comments (1)" })).toBeInTheDocument();
  });

  it("lets the owner take down anyone's comment, and the count follows", async () => {
    api.removeComment.mockResolvedValue(undefined);
    renderGrid({ owner: true });
    await userEvent.click(await screen.findByRole("button", { name: "Comments (2)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete comment by Zoe" }));
    expect(api.removeComment).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(screen.queryByText("Beautiful light")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Comments (1)" })).toBeInTheDocument();
  });

  it("lets a visitor take down only their own comment, change it, and report other people's", async () => {
    api.updateComment.mockResolvedValue({ comment: comment("c2", "me", "Me", "Thank you so much", { editedAt: "2026-10-05T00:00:00.000Z" }) });
    vi.spyOn(window, "prompt").mockReturnValue("spam");
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(moderationApi.report).mockResolvedValue({ report: {} });
    renderGrid();
    await userEvent.click(await screen.findByRole("button", { name: "Comments (2)" }));
    await screen.findByText("Beautiful light");
    expect(screen.getAllByRole("button", { name: /^Delete comment/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Delete comment by you" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Report comment by Zoe" }));
    expect(moderationApi.report).toHaveBeenCalledWith("mediaComment", "c1", "spam");

    await userEvent.click(screen.getByRole("button", { name: /^Edit your comment/ }));
    const box = screen.getByLabelText("Edit comment");
    await userEvent.clear(box);
    await userEvent.type(box, "Thank you so much");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.updateComment).toHaveBeenCalledWith("c2", "Thank you so much");
    expect(await screen.findByText("(edited)")).toBeInTheDocument();
  });

  it("lets signed-out visitors read but not write", async () => {
    renderGrid({ signedIn: false });
    await userEvent.click(await screen.findByRole("button", { name: "Comments (2)" }));
    expect(await screen.findByText("Beautiful light")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Write a comment…")).not.toBeInTheDocument();
  });

  it("opens the piece a notification was about and marks the comment", async () => {
    renderGrid({ owner: true, focusPiece: "m1", focusComment: "c1" });
    expect(await screen.findByText("Beautiful light")).toBeInTheDocument();
    expect(document.getElementById("comment-c1")).toHaveAttribute("aria-current", "true");
    expect(document.getElementById("comment-c2")).not.toHaveAttribute("aria-current");
  });

  it("ignores a notification about a piece that has gone", async () => {
    renderGrid({ owner: true, focusPiece: "gone", focusComment: "c1" });
    await screen.findByRole("button", { name: "Comments (2)" });
    expect(api.comments).not.toHaveBeenCalledWith("gone");
    expect(screen.queryByText("Beautiful light")).not.toBeInTheDocument();
  });
});
