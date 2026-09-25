import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProfileComments } from "./ProfileComments";
import { profilesApi } from "../../api/profiles.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { getComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(profilesApi);

function comment(id: string, authorId: string, name: string, content: string): Comment {
  return { id, content, createdAt: "", author: { id: authorId, username: name.toLowerCase(), displayName: name } as User } as Comment;
}

// `viewer` is who's looking; `profile` is whose page it is.
function renderComments(viewer: { id: string; username: string } | null, profile = "owner") {
  vi.mocked(useAuth).mockReturnValue({ user: viewer as User | null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  render(
    <MemoryRouter>
      <ProfileComments username={profile} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getComments.mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Wonderful work")] });
});

describe("ProfileComments (testimonials)", () => {
  it("lists testimonials, each author linked to their profile", async () => {
    renderComments(null);
    expect(await screen.findByText("Wonderful work")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Zoe/ })[0]).toHaveAttribute("href", "/u/zoe");
  });

  it("says so when there are none", async () => {
    api.getComments.mockResolvedValue({ comments: [] });
    renderComments(null);
    expect(await screen.findByText("No testimonials yet.")).toBeInTheDocument();
  });

  it("shows the empty state, not a stuck 'Loading…', when they can't be loaded (private profile)", async () => {
    api.getComments.mockRejectedValue(new ApiError(403, "This profile is private"));
    renderComments(null);
    expect(await screen.findByText("No testimonials yet.")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("only signed-in people can leave one", async () => {
    renderComments(null);
    await screen.findByText("Wonderful work");
    expect(screen.queryByPlaceholderText(/Leave a comment/)).not.toBeInTheDocument();
  });

  it("posts a trimmed testimonial to the top of the list", async () => {
    api.addComment.mockResolvedValue({ comment: comment("c2", "me", "Me", "Brand new") });
    renderComments({ id: "me", username: "me" });
    await screen.findByText("Wonderful work");
    await userEvent.type(screen.getByPlaceholderText(/Leave a comment/), "  Brand new ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(api.addComment).toHaveBeenCalledWith("owner", "Brand new");
    const items = await screen.findAllByText(/Brand new|Wonderful work/);
    expect(items[0]).toHaveTextContent("Brand new");
  });

  it("shows the server's message if posting fails (e.g. blocked)", async () => {
    api.addComment.mockRejectedValue(new ApiError(403, "Profile not available"));
    renderComments({ id: "me", username: "me" });
    await screen.findByText("Wonderful work");
    await userEvent.type(screen.getByPlaceholderText(/Leave a comment/), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText("Profile not available")).toBeInTheDocument();
  });

  it("lets a comment's author delete it", async () => {
    api.deleteComment.mockResolvedValue(undefined);
    renderComments({ id: "u-zoe", username: "zoe" });
    await userEvent.click(await screen.findByText("✕"));
    expect(api.deleteComment).toHaveBeenCalledWith("c1");
    expect(screen.queryByText("Wonderful work")).not.toBeInTheDocument();
  });

  it("lets the profile's owner delete any testimonial on their page", async () => {
    api.deleteComment.mockResolvedValue(undefined);
    renderComments({ id: "owner-id", username: "owner" }, "owner");
    expect(await screen.findByText("✕")).toBeInTheDocument();
  });

  it("gives other people no delete button", async () => {
    renderComments({ id: "someone", username: "someone" }, "owner");
    await screen.findByText("Wonderful work");
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });

  it("shows the server's message if deleting fails, and keeps the comment", async () => {
    api.deleteComment.mockRejectedValue(new ApiError(403, "Not allowed"));
    renderComments({ id: "u-zoe", username: "zoe" });
    await userEvent.click(await screen.findByText("✕"));
    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
    expect(screen.getByText("Wonderful work")).toBeInTheDocument();
  });
});
