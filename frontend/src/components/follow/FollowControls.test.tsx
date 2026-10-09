import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { FollowButton, FollowCounts, FollowLists } from "./FollowControls";
import { followsApi } from "../../api/follows.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/follows.api", () => ({ followsApi: { follow: vi.fn(), unfollow: vi.fn(), following: vi.fn(), followers: vi.fn() } }));
const api = vi.mocked(followsApi);
const person = (username: string) => ({ id: `id-${username}`, username, displayName: username.toUpperCase(), avatarUrl: null, csVerified: false });

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("FollowCounts", () => {
  it("says how many follow and how many are followed, with the right word for one", () => {
    const { rerender } = render(<FollowCounts followers={1} following={0} />);
    expect(screen.getByLabelText("Followers and following")).toHaveTextContent("1 follower · 0 following");
    rerender(<FollowCounts followers={12} following={5} />);
    expect(screen.getByLabelText("Followers and following")).toHaveTextContent("12 followers · 5 following");
  });
  it("for the owner, opens the lists", async () => {
    const onOpen = vi.fn();
    render(<FollowCounts followers={2} following={3} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "2 followers" }));
    await userEvent.click(screen.getByRole("button", { name: "3 following" }));
    expect(onOpen.mock.calls).toEqual([["followers"], ["following"]]);
  });
});

function Toggle({ start = false }: { start?: boolean }) {
  const [on, setOn] = useState(start);
  return <FollowButton username="sam" displayName="Sam" following={on} onChange={setOn} />;
}

describe("FollowButton", () => {
  it("follows, then shows Following and can stop", async () => {
    api.follow.mockResolvedValue({ following: true });
    api.unfollow.mockResolvedValue(undefined as never);
    render(<Toggle />);
    await userEvent.click(screen.getByRole("button", { name: "Follow Sam" }));
    expect(api.follow).toHaveBeenCalledWith("sam");
    const on = await screen.findByRole("button", { name: "Stop following Sam" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(on).toHaveTextContent("Following");
    await userEvent.click(on);
    expect(api.unfollow).toHaveBeenCalledWith("sam");
    expect(await screen.findByRole("button", { name: "Follow Sam" })).toHaveAttribute("aria-pressed", "false");
  });
  it("says why it couldn't, and stays as it was", async () => {
    api.follow.mockRejectedValue(new ApiError(404, "That profile can't be followed"));
    render(<Toggle />);
    await userEvent.click(screen.getByRole("button", { name: "Follow Sam" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That profile can't be followed");
    expect(screen.getByRole("button", { name: "Follow Sam" })).toBeEnabled();
  });
});

describe("FollowLists", () => {
  const show = (which: "followers" | "following", onUnfollowed = vi.fn()) =>
    render(
      <MemoryRouter>
        <FollowLists which={which} onClose={() => {}} onUnfollowed={onUnfollowed} />
      </MemoryRouter>
    );

  it("lists the people who follow you, linked to their profiles, without a way to remove them", async () => {
    api.followers.mockResolvedValue({ people: [person("ann"), person("ben")], page: 1, hasMore: false });
    show("followers");
    expect(await screen.findByRole("link", { name: /ANN/ })).toHaveAttribute("href", "/u/ann");
    expect(screen.getByRole("region", { name: "Your followers" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop following/ })).toBeNull();
  });
  it("lists the people you follow and lets you stop following one", async () => {
    api.following.mockResolvedValue({ people: [person("ann"), person("ben")], page: 1, hasMore: false });
    api.unfollow.mockResolvedValue(undefined as never);
    const onUnfollowed = vi.fn();
    show("following", onUnfollowed);
    await userEvent.click(await screen.findByRole("button", { name: "Stop following BEN" }));
    expect(api.unfollow).toHaveBeenCalledWith("ben");
    await waitFor(() => expect(screen.queryByRole("link", { name: /BEN/ })).toBeNull());
    expect(screen.getByRole("link", { name: /ANN/ })).toBeInTheDocument();
    expect(onUnfollowed).toHaveBeenCalled();
  });
  it("says so when the list is empty, and shows more when there is more", async () => {
    api.followers.mockResolvedValueOnce({ people: [], page: 1, hasMore: false });
    const first = show("followers");
    expect(await screen.findByText("No one follows you yet.")).toBeInTheDocument();
    first.unmount();
    api.following.mockResolvedValueOnce({ people: [person("ann")], page: 1, hasMore: true });
    api.following.mockResolvedValueOnce({ people: [person("cat")], page: 2, hasMore: false });
    show("following");
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("link", { name: /CAT/ })).toBeInTheDocument();
    expect(api.following).toHaveBeenLastCalledWith(2);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
  it("says when a list couldn't be loaded", async () => {
    api.followers.mockRejectedValue(new ApiError(500, "Server error"));
    show("followers");
    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
  });
});
