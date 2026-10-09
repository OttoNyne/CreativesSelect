import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PictureDescription } from "./PictureDescription";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import type { Post } from "../../types";

vi.mock("../../api/posts.api", () => ({ postsApi: { setPictureDescription: vi.fn() } }));
const set = vi.mocked(postsApi.setPictureDescription);

beforeEach(() => {
  set.mockReset();
});

describe("PictureDescription", () => {
  it("offers to add one when there is none, and saves what was written", async () => {
    set.mockResolvedValue({ post: { imageAlt: "A blue vase" } as Post });
    const onSaved = vi.fn();
    render(<PictureDescription postId="p1" value="" onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Describe picture" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Picture description" }), "  A blue vase ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(set).toHaveBeenCalledWith("p1", "A blue vase");
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("A blue vase"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("offers to edit an existing one, starting from it, and can clear it", async () => {
    set.mockResolvedValue({ post: { imageAlt: "" } as Post });
    const onSaved = vi.fn();
    render(<PictureDescription postId="p1" value="Old words" onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit picture description" }));
    const box = screen.getByRole("textbox", { name: "Picture description" });
    expect(box).toHaveValue("Old words");
    await userEvent.clear(box);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(set).toHaveBeenCalledWith("p1", "");
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(""));
  });

  it("can be cancelled, leaving things as they were", async () => {
    const onSaved = vi.fn();
    render(<PictureDescription postId="p1" value="Keep" onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit picture description" }));
    await userEvent.type(screen.getByRole("textbox"), " more");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Edit picture description" }));
    expect(screen.getByRole("textbox")).toHaveValue("Keep");
  });

  it("says why it couldn't be saved", async () => {
    set.mockRejectedValue(new ApiError(400, "A picture description can be up to 300 characters"));
    render(<PictureDescription postId="p1" value="" onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Describe picture" }));
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 300 characters");
  });
});
