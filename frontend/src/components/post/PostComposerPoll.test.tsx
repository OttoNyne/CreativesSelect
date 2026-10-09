import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostComposer } from "./PostComposer";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import type { Post } from "../../types";

vi.mock("../../api/posts.api", () => ({ postsApi: { create: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));
vi.mock("../ai/GenerateTextButton", () => ({ GenerateTextButton: () => null }));
vi.mock("../ai/GenerateImageButton", () => ({ GenerateImageButton: () => null }));
const create = vi.mocked(postsApi.create);
const post = { id: "p1", content: "hi" } as Post;
const box = () => screen.getByPlaceholderText(/Share what you're working on/);

beforeEach(() => {
  create.mockReset();
});

describe("PostComposer: polls", () => {
  it("offers a poll that starts with two options, and sends the options and how long it is open with the post", async () => {
    create.mockResolvedValue({ post });
    render(<PostComposer onPosted={vi.fn()} />);
    expect(screen.queryByRole("group", { name: /Poll/ })).toBeNull();
    await userEvent.type(box(), "Which colour?");
    await userEvent.click(screen.getByRole("button", { name: "Add a poll" }));
    expect(screen.getByRole("textbox", { name: "Option 1" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Option 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove option/ })).toBeNull(); // two is the least
    await userEvent.type(screen.getByRole("textbox", { name: "Option 1" }), "  Blue ");
    await userEvent.type(screen.getByRole("textbox", { name: "Option 2" }), "Green");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Poll length" }), "7 days");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ content: "Which colour?", poll: { options: ["Blue", "Green"], days: 7 } }));
    // posted: the poll is cleared away
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Option 1" })).toBeNull());
    expect(screen.getByRole("button", { name: "Add a poll" })).toBeInTheDocument();
  });

  it("allows up to four options, and removing one", async () => {
    render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a poll" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Add an option" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Add an option" }));
    expect(screen.getAllByRole("textbox", { name: /^Option/ })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "+ Add an option" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove option 3" }));
    expect(screen.getAllByRole("textbox", { name: /^Option/ })).toHaveLength(3);
  });

  it("needs two options with words in them, and says so without posting", async () => {
    render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "Question");
    await userEvent.click(screen.getByRole("button", { name: "Add a poll" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Option 1" }), "Only one");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(screen.getByText("A poll needs at least two options with words in them.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("drops the poll when asked, and sends none", async () => {
    create.mockResolvedValue({ post });
    render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "Just words");
    await userEvent.click(screen.getByRole("button", { name: "Add a poll" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove poll" }));
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(create.mock.calls[0][0]).not.toHaveProperty("poll");
  });

  it("keeps the poll when posting fails, and says why", async () => {
    create.mockRejectedValue(new ApiError(400, "Poll options must all be different"));
    render(<PostComposer onPosted={vi.fn()} />);
    await userEvent.type(box(), "Question");
    await userEvent.click(screen.getByRole("button", { name: "Add a poll" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Option 1" }), "A");
    await userEvent.type(screen.getByRole("textbox", { name: "Option 2" }), "a");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText("Poll options must all be different")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Option 1" })).toHaveValue("A");
  });
});
