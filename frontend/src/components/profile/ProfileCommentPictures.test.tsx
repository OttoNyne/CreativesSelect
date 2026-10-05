import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProfileComments } from "./ProfileComments";
import { profilesApi } from "../../api/profiles.api";
import { uploadFile } from "../../api/media.api";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { getComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn(), updateComment: vi.fn(), removeCommentPicture: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../api/ai.api", () => ({ aiApi: { discard: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(profilesApi);

const PICTURE = "https://res.cloudinary.example/image/upload/v1/creativeselect/comments/a.png";
const comment = (id: string, authorId: string, name: string, content: string, over: Partial<Comment> = {}): Comment =>
  ({ id, content, createdAt: "", author: { id: authorId, username: name.toLowerCase(), displayName: name } as User, ...over }) as Comment;
const file = () => new File(["x"], "pic.png", { type: "image/png" });

function renderComments(viewerId: string | null = "me", profile = "owner") {
  vi.mocked(useAuth).mockReturnValue({ user: viewerId ? ({ id: viewerId, username: viewerId } as User) : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  render(
    <MemoryRouter>
      <ProfileComments username={profile} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(uploadFile).mockReset();
  vi.mocked(aiApi.discard).mockReset();
  vi.mocked(aiApi.discard).mockResolvedValue(undefined);
});

describe("ProfileComments: pictures and links in testimonials", () => {
  it("shows a testimonial's picture, and makes its links links", async () => {
    api.getComments.mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Her work: https://example.com/zoe", { imageUrl: PICTURE })] });
    renderComments();
    expect(await screen.findByRole("link", { name: "example.com/zoe" })).toHaveAttribute("href", "https://example.com/zoe");
    expect(screen.getByRole("img", { name: "Picture in a comment" })).toHaveAttribute("src", PICTURE);
  });

  it("posts a testimonial with a picture, or a picture alone", async () => {
    api.getComments.mockResolvedValue({ comments: [] });
    vi.mocked(uploadFile).mockResolvedValue({ url: PICTURE });
    api.addComment.mockResolvedValue({ comment: comment("c9", "me", "Me", "Brilliant", { imageUrl: PICTURE }) });
    renderComments();
    await screen.findByText("No testimonials yet.");
    fireEvent.change(screen.getByLabelText("Choose a picture for your comment"), { target: { files: [file()] } });
    await screen.findByRole("img", { name: "Picture to post with your comment" });
    await userEvent.type(screen.getByPlaceholderText("Leave a comment on this profile…"), "Brilliant");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(api.addComment).toHaveBeenCalledWith("owner", "Brilliant", PICTURE);
    expect(await screen.findByRole("img", { name: "Picture in a comment" })).toBeInTheDocument();

    api.addComment.mockResolvedValue({ comment: comment("c10", "me", "Me", "", { imageUrl: PICTURE }) });
    fireEvent.change(screen.getByLabelText("Choose a picture for your comment"), { target: { files: [file()] } });
    await screen.findByRole("img", { name: "Picture to post with your comment" });
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(api.addComment).toHaveBeenLastCalledWith("owner", "", PICTURE);
  });

  it("still posts words alone the old way", async () => {
    api.getComments.mockResolvedValue({ comments: [] });
    api.addComment.mockResolvedValue({ comment: comment("c9", "me", "Me", "Nice work") });
    renderComments();
    await userEvent.type(await screen.findByPlaceholderText("Leave a comment on this profile…"), "Nice work");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(api.addComment).toHaveBeenCalledWith("owner", "Nice work");
  });

  it("posts nothing with neither words nor a picture", async () => {
    api.getComments.mockResolvedValue({ comments: [] });
    renderComments();
    await screen.findByText("No testimonials yet.");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(api.addComment).not.toHaveBeenCalled();
  });

  it("lets the writer take the picture off their testimonial, and nobody else", async () => {
    api.getComments.mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Hers", { imageUrl: PICTURE }), comment("c2", "me", "Me", "Mine", { imageUrl: PICTURE })] });
    api.removeCommentPicture.mockResolvedValue({ comment: comment("c2", "me", "Me", "Mine", { imageUrl: null }) });
    renderComments("me", "someone-else");
    await screen.findByText("Mine");
    expect(screen.getAllByRole("button", { name: "Remove the picture from your testimonial" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Remove the picture from your testimonial" }));
    expect(api.removeCommentPicture).toHaveBeenCalledWith("c2");
    await waitFor(() => expect(screen.getAllByRole("img", { name: "Picture in a comment" })).toHaveLength(1));
  });

  it("shows the server's reason when a testimonial is refused", async () => {
    api.getComments.mockResolvedValue({ comments: [] });
    api.addComment.mockRejectedValue(new ApiError(400, "Testimonials can have up to 3 links"));
    renderComments();
    await userEvent.type(await screen.findByPlaceholderText("Leave a comment on this profile…"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText("Testimonials can have up to 3 links")).toBeInTheDocument();
  });
});
