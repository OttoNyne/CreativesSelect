import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ReportButton } from "./ReportButton";
import { PostCard } from "../post/PostCard";
import { PortfolioTile } from "../profile/PortfolioTile";
import { moderationApi } from "../../api/moderation.api";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../api/client";
import type { MediaItem, Post, User } from "../../types";

vi.mock("../../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));
vi.mock("../post/PostCommentList", () => ({ PostCommentList: () => null }));
vi.mock("../common/ReactionBar", () => ({ ReactionBar: () => null }));
vi.mock("../common/SaveButton", () => ({ SaveButton: () => null }));
vi.mock("../profile/PieceCredits", () => ({ PieceCredits: () => null }));
vi.mock("../profile/ProcessTimeline", () => ({ ProcessTimeline: () => null }));

const report = vi.mocked(moderationApi.report);
const signedIn = (id: string) => vi.mocked(useAuth).mockReturnValue({ user: { id, username: id } as User, isLoading: false, setUser: vi.fn(), refresh: async () => {} });

beforeEach(() => {
  report.mockReset().mockResolvedValue({ report: {} });
  signedIn("viewer");
});

describe("ReportButton", () => {
  it("opens a box for the reason, sends it, and says thanks", async () => {
    render(<ReportButton targetType="call" targetId="c1" label="Report this call" />);
    await userEvent.click(screen.getByRole("button", { name: "Report this call" }));
    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("What's the issue?"), "  Spam  ");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(report).toHaveBeenCalledWith("call", "c1", "Spam");
    expect(await screen.findByRole("status")).toHaveTextContent("Thanks. A moderator will take a look.");
    expect(screen.queryByRole("button", { name: "Report this call" })).toBeNull();
  });

  it("can be cancelled, and says why it couldn't be sent", async () => {
    report.mockRejectedValue(new ApiError(429, "You've sent a lot of reports — try again later."));
    render(<ReportButton targetType="call" targetId="c1" label="Report this call" />);
    await userEvent.click(screen.getByRole("button", { name: "Report this call" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Report this call" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Report this call" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("a lot of reports");
    expect(screen.getByLabelText("What's the issue?")).toHaveValue("x");
  });
});

describe("where it is offered", () => {
  const ada = { id: "u1", username: "ada", displayName: "Ada", isPrivate: false } as User;
  const post = { id: "p1", authorId: "u1", author: ada, content: "Words", imageUrl: null, isAiText: false, isAiImage: false, commentCount: 0, createdAt: new Date().toISOString() } as Post;
  const piece = { id: "m1", ownerId: "u1", url: "https://images.example.com/a.jpg", type: "image", caption: "A vase", isAiImage: false, reactions: { counts: {}, total: 0, mine: null }, createdAt: "" } as MediaItem;

  it("on someone else's post, not on your own or when signed out", async () => {
    const show = () => render(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    const { unmount } = show();
    await userEvent.click(screen.getByRole("button", { name: "Report this post" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Rude");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(report).toHaveBeenCalledWith("post", "p1", "Rude");
    unmount();
    signedIn("u1");
    const own = show();
    expect(screen.queryByRole("button", { name: "Report this post" })).toBeNull();
    own.unmount();
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
    show();
    expect(screen.queryByRole("button", { name: "Report this post" })).toBeNull();
  });

  it("on someone else's portfolio piece, not on your own", async () => {
    const show = (isOwner: boolean) => render(<PortfolioTile item={piece} isOwner={isOwner} canReact onRemove={vi.fn()} onReact={vi.fn()} />);
    const { unmount } = show(false);
    await userEvent.click(screen.getByRole("button", { name: "Report this piece" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Stolen");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(report).toHaveBeenCalledWith("piece", "m1", "Stolen");
    unmount();
    show(true);
    expect(screen.queryByRole("button", { name: "Report this piece" })).toBeNull();
  });
});
