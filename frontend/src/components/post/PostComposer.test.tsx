import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostComposer } from "./PostComposer";
import { postsApi } from "../../api/posts.api";
import { uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import type { Post } from "../../types";

vi.mock("../../api/posts.api", () => ({ postsApi: { create: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
// The AI buttons have their own tests: stand in for them so we can trigger what they produce.
vi.mock("../ai/GenerateTextButton", () => ({
  GenerateTextButton: ({ onGenerated }: { onGenerated: (t: string) => void }) => (
    <button type="button" onClick={() => onGenerated("An AI caption")}>
      fake-ai-text
    </button>
  ),
}));
vi.mock("../ai/GenerateImageButton", () => ({
  GenerateImageButton: ({ onGenerated }: { onGenerated: (u: string) => void }) => (
    <button type="button" onClick={() => onGenerated("https://cdn.example.com/ai.jpg")}>
      fake-ai-image
    </button>
  ),
}));
const create = vi.mocked(postsApi.create);
const post = { id: "p1", content: "hi" } as Post;

function renderComposer() {
  const onPosted = vi.fn();
  render(<PostComposer onPosted={onPosted} />);
  return onPosted;
}
const box = () => screen.getByPlaceholderText(/Share what you're working on/);

beforeEach(() => {
  create.mockReset();
  vi.mocked(uploadFile).mockReset();
});

describe("PostComposer", () => {
  it("can't post an empty or blank message", async () => {
    renderComposer();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    await userEvent.type(box(), "   ");
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  it("posts trimmed text, hands the post to the page, and clears itself", async () => {
    create.mockResolvedValue({ post });
    const onPosted = renderComposer();
    await userEvent.type(box(), "  My new piece  ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(create).toHaveBeenCalledWith({ content: "My new piece", imageUrl: null, isAiText: false, isAiImage: false });
    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(post));
    expect(box()).toHaveValue("");
  });

  it("flags AI-assisted text and AI images so the post carries its badges", async () => {
    create.mockResolvedValue({ post });
    renderComposer();
    await userEvent.type(box(), "idea");
    await userEvent.click(screen.getByText("fake-ai-text"));
    expect(box()).toHaveValue("An AI caption");
    await userEvent.click(screen.getByText("fake-ai-image"));
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(create).toHaveBeenCalledWith({
      content: "An AI caption",
      imageUrl: "https://cdn.example.com/ai.jpg",
      isAiText: true,
      isAiImage: true,
    });
  });

  it("attaches an uploaded image (not flagged as AI) and lets you remove it before posting", async () => {
    vi.mocked(uploadFile).mockResolvedValue({ url: "https://cdn.example.com/upload.png" });
    create.mockResolvedValue({ post });
    const { container } = render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "look");
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "portfolio");

    await userEvent.click(screen.getByText("✕"));
    expect(container.querySelector("img")).toBeNull();

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "b.png", { type: "image/png" })] } });
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: "https://cdn.example.com/upload.png", isAiImage: false }));
  });

  it("shows the server's message if the upload is rejected", async () => {
    vi.mocked(uploadFile).mockRejectedValue(new ApiError(413, "That file is too large to upload — images can be up to 10 MB."));
    const { container } = render(<PostComposer onPosted={vi.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "big.png", { type: "image/png" })] } });
    expect(await screen.findByText(/images can be up to 10 MB/)).toBeInTheDocument();
  });

  it("keeps the draft and shows the message if posting fails", async () => {
    create.mockRejectedValue(new ApiError(429, "Too many requests"));
    const onPosted = renderComposer();
    await userEvent.type(box(), "Important draft");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(onPosted).not.toHaveBeenCalled();
    expect(box()).toHaveValue("Important draft");
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
  });
});
