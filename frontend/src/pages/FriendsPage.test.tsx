import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { FriendsPage } from "./FriendsPage";
import { friendsApi } from "../api/friends.api";
import { ApiError } from "../api/client";
import type { FriendRequest, User } from "../types";

vi.mock("../api/friends.api", () => ({
  friendsApi: { list: vi.fn(), requests: vi.fn(), accept: vi.fn(), decline: vi.fn(), remove: vi.fn(), request: vi.fn() },
}));
const api = vi.mocked(friendsApi);

const zoe = { id: "u2", username: "zoe", displayName: "Zoe" } as User;
const kai = { id: "u3", username: "kai", displayName: "Kai" } as User;
const pending: FriendRequest = { id: "r1", createdAt: "", requester: kai } as FriendRequest;

function renderPage() {
  render(
    <MemoryRouter>
      <FriendsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.list.mockResolvedValue({ friends: [zoe] });
  api.requests.mockResolvedValue({ requests: [pending] });
});

describe("FriendsPage", () => {
  it("lists friends and pending requests", async () => {
    renderPage();
    expect(await screen.findByText("Friends (1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zoe" })).toHaveAttribute("href", "/u/zoe");
    expect(screen.getByText("Friend Requests")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kai" })).toBeInTheDocument();
  });

  it("shows an empty state, and no requests section, when there's nothing", async () => {
    api.list.mockResolvedValue({ friends: [] });
    api.requests.mockResolvedValue({ requests: [] });
    renderPage();
    expect(await screen.findByText(/No friends yet/)).toBeInTheDocument();
    expect(screen.queryByText("Friend Requests")).not.toBeInTheDocument();
  });

  it("accepts a request and reloads the lists", async () => {
    api.accept.mockResolvedValue({ friendship: {} as never });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(api.accept).toHaveBeenCalledWith("r1");
    await vi.waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it("declines a request", async () => {
    api.decline.mockResolvedValue({ friendship: {} as never });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(api.decline).toHaveBeenCalledWith("r1");
  });

  it("unfriends someone", async () => {
    api.remove.mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Unfriend" }));
    expect(api.remove).toHaveBeenCalledWith("u2");
  });

  it("shows the server's message when an action fails, and keeps the page", async () => {
    api.accept.mockRejectedValue(new ApiError(404, "Request not found"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Request not found")).toBeInTheDocument();
    expect(screen.getByText("Friends (1)")).toBeInTheDocument();
  });

  it("shows a load error instead of an empty page", async () => {
    api.list.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPage();
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });
});
