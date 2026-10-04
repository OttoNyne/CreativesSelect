import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PostCard } from "./PostCard";
import { useAuth } from "../../context/AuthContext";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import type { Post, User } from "../../types";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/posts.api", () => ({ postsApi: { update: vi.fn() } }));
vi.mock("./PostCommentList", () => ({
  PostCommentList: ({ postId, onCountChange }: { postId: string; onCountChange: (n: number) => void }) => (
    <div>
      comments for {postId}
      <button onClick={() => onCountChange(3)}>fake-three-comments</button>
    </div>
  ),
}));

const author = { id: "u1", username: "ada", displayName: "Ada Lovelace" } as User;
function makePost(over: Partial<Post> = {}): Post {
  return {
    id: "p1",
    authorId: "u1",
    author,
    content: "Sketching all day",
    imageUrl: null,
    isAiText: false,
    isAiImage: false,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    ...over,
  } as Post;
}

function renderCard(post: Post, viewerId: string | null, onDeleted?: (id: string) => void) {
  vi.mocked(useAuth).mockReturnValue({
    user: viewerId ? ({ id: viewerId, username: "viewer" } as User) : null,
    isLoading: false,
    setUser: () => {},
    refresh: async () => {},
  });
  render(
    <MemoryRouter>
      <PostCard post={post} onDeleted={onDeleted} />
    </MemoryRouter>
  );
}

describe("PostCard", () => {
  it("shows the author (linked to their profile), the handle, how long ago, and the text", () => {
    renderCard(makePost(), "u2");
    expect(screen.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByText(/@ada · just now/)).toBeInTheDocument();
    expect(screen.getByText("Sketching all day")).toBeInTheDocument();
  });

  it("can start with its comments open (when you arrive from a notification)", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, setUser: () => {}, refresh: async () => {} });
    render(
      <MemoryRouter>
        <PostCard post={makePost()} autoOpenComments />
      </MemoryRouter>
    );
    expect(screen.getByText(/comments for p1/)).toBeInTheDocument();
  });

  it("keeps its comments closed by default", () => {
    renderCard(makePost(), "u2");
    expect(screen.queryByText(/comments for p1/)).not.toBeInTheDocument();
  });

  it("shows the attached image", () => {
    const { container } = render(<div />);
    container.remove();
    renderCard(makePost({ imageUrl: "https://cdn.example.com/p.jpg" }), "u2");
    expect(document.querySelector('img[src="https://cdn.example.com/p.jpg"]')).not.toBeNull();
  });

  it("shows a framed picture the way its author framed it", () => {
    renderCard(makePost({ imageUrl: "https://cdn.example.com/p.jpg", imageAspect: "16:9", imageZoom: 2, imagePosition: "30% 70%" }), "u2");
    const img = document.querySelector('img[src="https://cdn.example.com/p.jpg"]') as HTMLImageElement;
    expect(img.style.transform).toBe("scale(2)");
    expect(img.style.objectPosition).toBe("30% 70%");
    expect((img.parentElement as HTMLElement).style.aspectRatio).toBe("16 / 9");
  });

  it("keeps showing pictures from before framing existed exactly as they were", () => {
    renderCard(makePost({ imageUrl: "https://cdn.example.com/old.jpg", imageAspect: null, imageZoom: null, imagePosition: null }), "u2");
    const img = document.querySelector('img[src="https://cdn.example.com/old.jpg"]') as HTMLImageElement;
    expect(img.style.transform).toBe("");
    expect(img.className).toMatch(/max-h-96/);
    expect((img.parentElement as HTMLElement).style.aspectRatio).toBe("");
  });

  it("shows AI badges only when the post used AI", () => {
    renderCard(makePost({ isAiText: true, isAiImage: true }), "u2");
    expect(screen.getByText(/AI-assisted text/)).toBeInTheDocument();
    expect(screen.getByText(/AI-generated image/)).toBeInTheDocument();
  });

  it("shows no AI badges on a plain post", () => {
    renderCard(makePost(), "u2");
    expect(screen.queryByText(/AI-/)).not.toBeInTheDocument();
  });

  it("pluralizes the comment count", () => {
    renderCard(makePost({ commentCount: 1 }), "u2");
    expect(screen.getByRole("button", { name: /1 comment$/ })).toBeInTheDocument();
  });

  it("opens the comments, and updates the count when a comment is added", async () => {
    renderCard(makePost({ commentCount: 0 }), "u2");
    expect(screen.getByRole("button", { name: /0 comments/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /0 comments/ }));
    expect(screen.getByText(/comments for p1/)).toBeInTheDocument();

    await userEvent.click(screen.getByText("fake-three-comments"));
    expect(screen.getByRole("button", { name: /3 comments/ })).toBeInTheDocument();
  });

  it("lets the author delete their own post", async () => {
    const onDeleted = vi.fn();
    renderCard(makePost(), "u1", onDeleted);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleted).toHaveBeenCalledWith("p1");
  });

  it("gives everyone else no Delete button, and nothing to signed-out visitors", () => {
    renderCard(makePost(), "u2", vi.fn());
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("doesn't show Delete when no delete handler is provided", () => {
    renderCard(makePost(), "u1");
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("lets the author change the post, showing the new words with (edited)", async () => {
    vi.mocked(postsApi.update).mockResolvedValue({ post: makePost({ content: "Sketching all week", editedAt: "2026-05-01T00:00:00.000Z" }) });
    renderCard(makePost(), "u1");
    expect(screen.queryByText("(edited)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Edit post");
    await userEvent.clear(box);
    await userEvent.type(box, "Sketching all week");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(postsApi.update).toHaveBeenCalledWith("p1", "Sketching all week");
    expect(await screen.findByText(/Sketching all week/)).toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit post")).not.toBeInTheDocument();
  });

  it("shows why a change couldn't be saved and keeps the box open", async () => {
    vi.mocked(postsApi.update).mockRejectedValue(new ApiError(429, "Slow down"));
    renderCard(makePost(), "u1");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("Edit post"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Slow down")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit post")).toBeInTheDocument();
  });

  it("doesn't offer Edit to anyone but the author, and marks an already edited post", () => {
    renderCard(makePost({ editedAt: "2026-05-01T00:00:00.000Z" }), "someone-else");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });
});
