import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostComposer } from "./PostComposer";
import { postsApi } from "../../api/posts.api";
import { scheduledPostsApi } from "../../api/scheduledPosts.api";
import { ApiError } from "../../api/client";
import type { ScheduledPost } from "../../types";

vi.mock("../../api/posts.api", () => ({ postsApi: { create: vi.fn() } }));
vi.mock("../../api/scheduledPosts.api", () => ({ scheduledPostsApi: { create: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));
vi.mock("../ai/GenerateTextButton", () => ({ GenerateTextButton: () => null }));
vi.mock("../ai/GenerateImageButton", () => ({ GenerateImageButton: () => null }));
const create = vi.mocked(scheduledPostsApi.create);
const box = () => screen.getByPlaceholderText(/Share what you're working on/);
const AT = "2030-05-01T09:30";
const waiting = (over: Partial<ScheduledPost> = {}): ScheduledPost => ({
  id: "s1",
  content: "Opening night",
  imageUrl: null,
  imageAspect: null,
  imageZoom: null,
  imagePosition: null,
  imageAlt: "",
  poll: null,
  isAiText: false,
  isAiImage: false,
  publishAt: new Date(AT).toISOString(),
  failed: false,
  failure: "",
  createdAt: "",
  ...over,
});

beforeEach(() => {
  create.mockReset();
  vi.mocked(postsApi.create).mockReset();
});

describe("PostComposer: scheduling", () => {
  it("offers a time to publish on, and changes what the button says", async () => {
    render(<PostComposer onPosted={vi.fn()} />);
    expect(screen.queryByLabelText("Publish on")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Schedule for later" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Publish on")).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("Publish on")).toHaveAttribute("min");
    expect(screen.getByRole("button", { name: "Schedule post" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Post" })).toBeInTheDocument();
  });

  it("asks for a time before it schedules anything", async () => {
    render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "Opening night");
    await userEvent.click(screen.getByRole("button", { name: "Schedule for later" }));
    await userEvent.click(screen.getByRole("button", { name: "Schedule post" }));
    expect(screen.getByText("Choose when it should be published.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("sends the words, the poll and the time, makes no post now, hands the waiting one to the page and says when it goes out", async () => {
    create.mockResolvedValue({ post: waiting() });
    const onPosted = vi.fn();
    const onScheduled = vi.fn();
    render(<PostComposer onPosted={onPosted} onScheduled={onScheduled} />);
    await userEvent.type(box(), "  Opening night ");
    await userEvent.click(screen.getByRole("button", { name: "Add a poll" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Option 1" }), "Yes");
    await userEvent.type(screen.getByRole("textbox", { name: "Option 2" }), "No");
    await userEvent.click(screen.getByRole("button", { name: "Schedule for later" }));
    fireEvent.change(screen.getByLabelText("Publish on"), { target: { value: AT } });
    await userEvent.click(screen.getByRole("button", { name: "Schedule post" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ content: "Opening night", poll: { options: ["Yes", "No"], days: 1 }, publishAt: new Date(AT).toISOString() }));
    expect(postsApi.create).not.toHaveBeenCalled();
    expect(onPosted).not.toHaveBeenCalled();
    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" })));
    expect(screen.getByRole("status")).toHaveTextContent(/^Scheduled for .*2030|^Scheduled for .*May/);
    // cleared, and back to posting now
    expect(box()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Post" })).toBeInTheDocument();
  });

  it("says why it couldn't schedule, and keeps what was written", async () => {
    create.mockRejectedValue(new ApiError(409, "You can have up to 20 scheduled posts — publish or remove one first"));
    render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "Opening night");
    await userEvent.click(screen.getByRole("button", { name: "Schedule for later" }));
    fireEvent.change(screen.getByLabelText("Publish on"), { target: { value: AT } });
    await userEvent.click(screen.getByRole("button", { name: "Schedule post" }));
    expect(await screen.findByText(/up to 20 scheduled posts/)).toBeInTheDocument();
    expect(box()).toHaveValue("Opening night");
    expect(screen.getByLabelText("Publish on")).toHaveValue(AT);
  });
});
