import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostComposer } from "./PostComposer";
import { postsApi } from "../../api/posts.api";
import { uploadFile } from "../../api/media.api";
import type { Post } from "../../types";

vi.mock("../../api/posts.api", () => ({ postsApi: { create: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));
vi.mock("../ai/GenerateTextButton", () => ({ GenerateTextButton: () => null }));
vi.mock("../ai/GenerateImageButton", () => ({
  GenerateImageButton: ({ onGenerated }: { onGenerated: (u: string) => void }) => (
    <button type="button" onClick={() => onGenerated("https://cdn.example.com/ai.jpg")}>
      fake-ai-image
    </button>
  ),
}));
const create = vi.mocked(postsApi.create);
const post = { id: "p1", content: "hi" } as Post;
const box = () => screen.getByPlaceholderText(/Share what you're working on/);
const description = () => screen.queryByRole("textbox", { name: /Describe the picture/ });
const attach = (container: HTMLElement, name = "a.png") => fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], name, { type: "image/png" })] } });

beforeEach(() => {
  create.mockReset();
  vi.mocked(uploadFile).mockReset();
  vi.mocked(uploadFile).mockResolvedValue({ url: "https://cdn.example.com/upload.png" });
});

describe("PostComposer: describing the picture", () => {
  it("offers a description box only once a picture is attached, and sends what was written with the post", async () => {
    create.mockResolvedValue({ post });
    const { container } = render(<PostComposer onPosted={vi.fn()} />);
    expect(description()).toBeNull();
    await userEvent.type(box(), "look");
    attach(container);
    await waitFor(() => expect(description()).not.toBeNull());
    await userEvent.type(description()!, "  A blue vase on a table ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: "https://cdn.example.com/upload.png", imageAlt: "A blue vase on a table" }));
    await waitFor(() => expect(description()).toBeNull());
  });

  it("sends no description when none was written, and takes the box away with the picture", async () => {
    create.mockResolvedValue({ post });
    const { container } = render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "look");
    attach(container);
    await waitFor(() => expect(description()).not.toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(create.mock.calls[0][0]).not.toHaveProperty("imageAlt");
    await waitFor(() => expect(description()).toBeNull());
    attach(container, "b.png");
    await waitFor(() => expect(description()).not.toBeNull());
    await userEvent.type(description()!, "gone soon");
    await userEvent.click(screen.getByText("✕"));
    expect(description()).toBeNull();
  });

  it("starts a picture made from the words with those words as its description", async () => {
    render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "a harbor at dusk");
    await userEvent.click(screen.getByRole("button", { name: "fake-ai-image" }));
    expect(description()).toHaveValue("a harbor at dusk");
  });
});
