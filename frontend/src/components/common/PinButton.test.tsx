import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinButton } from "./PinButton";
import { postsApi } from "../../api/posts.api";
import { mediaApi } from "../../api/media.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/posts.api", () => ({ postsApi: { pin: vi.fn(), unpin: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ mediaApi: { feature: vi.fn(), unfeature: vi.fn() } }));

beforeEach(() => {
  vi.mocked(postsApi.pin).mockReset().mockResolvedValue({ pinned: true });
  vi.mocked(postsApi.unpin).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(mediaApi.feature).mockReset().mockResolvedValue({ featured: true });
  vi.mocked(mediaApi.unfeature).mockReset().mockResolvedValue(undefined as never);
});

describe("PinButton", () => {
  it("pins a post to the profile and tells whoever is listening", async () => {
    const onChange = vi.fn();
    render(<PinButton kind="post" id="p1" on={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Pin this post to the top of your profile" }));
    expect(postsApi.pin).toHaveBeenCalledWith("p1");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("takes a pinned post down again", async () => {
    const onChange = vi.fn();
    render(<PinButton kind="post" id="p1" on onChange={onChange} />);
    const button = screen.getByRole("button", { name: "Take this post off the top of your profile" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(postsApi.unpin).toHaveBeenCalledWith("p1");
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("features and un-features a portfolio piece", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PinButton kind="piece" id="m1" on={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Feature this piece first in your portfolio" }));
    expect(mediaApi.feature).toHaveBeenCalledWith("m1");
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<PinButton kind="piece" id="m1" on onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Stop featuring this piece" }));
    expect(mediaApi.unfeature).toHaveBeenCalledWith("m1");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("says why it couldn't, and changes nothing", async () => {
    vi.mocked(postsApi.pin).mockRejectedValue(new ApiError(404, "Post not found"));
    const onChange = vi.fn();
    render(<PinButton kind="post" id="p1" on={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Pin this post/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Post not found");
    expect(onChange).not.toHaveBeenCalled();
  });
});
