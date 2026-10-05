import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlogComments } from "./BlogComments";
import { blogApi } from "../../api/blog.api";
import { moderationApi } from "../../api/moderation.api";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../api/blog.api", () => ({ blogApi: { comments: vi.fn(), addComment: vi.fn(), updateComment: vi.fn(), removeComment: vi.fn(), removeCommentPicture: vi.fn() } }));
vi.mock("../../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../api/ai.api", () => ({ aiApi: { discard: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(blogApi);

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name }) as User;
const comment = (id: string, authorId: string, name: string, content: string, over: Partial<Comment> = {}): Comment => ({ id, content, createdAt: "", author: person(authorId, name), ...over }) as Comment;

function renderIt({ isAuthor = false, signedIn = true, highlightId = null as string | null } = {}) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? person(isAuthor ? "author" : "me", isAuthor ? "Author" : "Me") : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  const onCountChange = vi.fn();
  render(<BlogComments entryId="e1" isAuthor={isAuthor} onCountChange={onCountChange} highlightId={highlightId} />);
  return onCountChange;
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(moderationApi.report).mockReset();
  window.confirm = vi.fn(() => true);
  api.comments.mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Lovely writing"), comment("c2", "me", "Me", "Thanks")], hasMore: false });
});

describe("BlogComments", () => {
  it("lists the comments of the entry", async () => {
    renderIt();
    expect(await screen.findByText("Lovely writing")).toBeInTheDocument();
    expect(api.comments).toHaveBeenCalledWith("e1");
  });

  it("adds a comment and tells the page the count went up", async () => {
    api.addComment.mockResolvedValue({ comment: comment("c3", "me", "Me", "Great read") });
    const onCountChange = renderIt();
    await screen.findByText("Lovely writing");
    await userEvent.type(screen.getByPlaceholderText("Write a comment…"), "Great read");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(api.addComment).toHaveBeenCalledWith("e1", "Great read");
    expect(await screen.findByText("Great read")).toBeInTheDocument();
    expect(onCountChange.mock.calls[0][0](2)).toBe(3);
  });

  it("shows more comments after the last one, until there are no more", async () => {
    api.comments.mockResolvedValueOnce({ comments: [comment("c1", "u-zoe", "Zoe", "First")], hasMore: true });
    api.comments.mockResolvedValueOnce({ comments: [comment("c2", "u-kai", "Kai", "Second")], hasMore: false });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Show more comments" }));
    expect(api.comments).toHaveBeenLastCalledWith("e1", "c1");
    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more comments" })).not.toBeInTheDocument();
  });

  it("lets the commenter change their comment and take a picture off it", async () => {
    api.comments.mockResolvedValue({ comments: [comment("c2", "me", "Me", "Thanks", { imageUrl: "https://res.cloudinary.example/image/upload/a.png" })] });
    api.updateComment.mockResolvedValue({ comment: comment("c2", "me", "Me", "Thanks a lot", { editedAt: "2026-10-05T00:00:00.000Z", imageUrl: "https://res.cloudinary.example/image/upload/a.png" }) });
    api.removeCommentPicture.mockResolvedValue({ comment: comment("c2", "me", "Me", "Thanks a lot", { imageUrl: null }) });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: /^Edit your comment/ }));
    const box = screen.getByLabelText("Edit comment");
    await userEvent.clear(box);
    await userEvent.type(box, "Thanks a lot");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.updateComment).toHaveBeenCalledWith("c2", "Thanks a lot");
    expect(await screen.findByText("(edited)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Remove the picture from your comment/ }));
    expect(api.removeCommentPicture).toHaveBeenCalledWith("c2");
    await waitFor(() => expect(screen.queryByRole("img", { name: "Picture in a comment" })).not.toBeInTheDocument());
  });

  it("lets the author of the entry take down anyone's comment, but a reader only their own", async () => {
    api.removeComment.mockResolvedValue(undefined);
    renderIt({ isAuthor: true });
    await userEvent.click(await screen.findByRole("button", { name: "Delete comment by Zoe" }));
    expect(api.removeComment).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(screen.queryByText("Lovely writing")).not.toBeInTheDocument());
  });

  it("offers a reader Delete only on their own comment, and a report on others'", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("spam");
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(moderationApi.report).mockResolvedValue({ report: {} });
    renderIt();
    await screen.findByText("Lovely writing");
    expect(screen.getAllByRole("button", { name: /^Delete comment/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Delete comment by you" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Report comment by Zoe" }));
    expect(moderationApi.report).toHaveBeenCalledWith("blogComment", "c1", "spam");
  });

  it("marks the comment a notification was about", async () => {
    renderIt({ highlightId: "c1" });
    await screen.findByText("Lovely writing");
    expect(document.getElementById("comment-c1")).toHaveAttribute("aria-current", "true");
    expect(document.getElementById("comment-c2")).not.toHaveAttribute("aria-current");
  });
});
