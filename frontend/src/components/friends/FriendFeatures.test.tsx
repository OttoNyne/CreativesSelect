import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PeopleYouMayKnow } from "./PeopleYouMayKnow";
import { MutualFriends } from "../profile/MutualFriends";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import type { FriendSuggestion, User } from "../../types";

vi.mock("../../api/friends.api", () => ({ friendsApi: { mutual: vi.fn(), suggestions: vi.fn(), request: vi.fn(), dismissSuggestion: vi.fn() } }));
const api = vi.mocked(friendsApi);

const person = (username: string, name: string) => ({ id: "u-" + username, username, displayName: name, avatarUrl: null }) as User;
const suggestion = (username: string, name: string, mutualCount: number, mutual: string[]): FriendSuggestion => ({ user: person(username, name), mutualCount, mutual: mutual.map((m) => person(m.toLowerCase(), m)) });

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("MutualFriends", () => {
  const renderIt = () =>
    render(
      <MemoryRouter>
        <MutualFriends username="zoe" />
      </MemoryRouter>
    );

  it("shows how many friends you share and who, each linking to their profile", async () => {
    api.mutual.mockResolvedValue({ count: 2, friends: [person("ann", "Ann"), person("bob", "Bob")] });
    renderIt();
    expect(await screen.findByText("2 mutual friends:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ann/ })).toHaveAttribute("href", "/u/ann");
    expect(screen.getByRole("link", { name: /Bob/ })).toBeInTheDocument();
    expect(api.mutual).toHaveBeenCalledWith("zoe");
  });

  it("says 'friend' for one, and how many more when only some are shown", async () => {
    api.mutual.mockResolvedValue({ count: 1, friends: [person("ann", "Ann")] });
    const { unmount } = renderIt();
    expect(await screen.findByText("1 mutual friend:")).toBeInTheDocument();
    unmount();
    api.mutual.mockResolvedValue({ count: 11, friends: Array.from({ length: 8 }, (_, i) => person(`p${i}`, `P${i}`)) });
    renderIt();
    expect(await screen.findByText("and 3 more")).toBeInTheDocument();
  });

  it("shows nothing when there are none, or when it can't be loaded", async () => {
    api.mutual.mockResolvedValue({ count: 0, friends: [] });
    const { container, unmount } = renderIt();
    await waitFor(() => expect(api.mutual).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    api.mutual.mockRejectedValue(new ApiError(403, "Profile not available"));
    const second = renderIt();
    await waitFor(() => expect(api.mutual).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});

describe("PeopleYouMayKnow", () => {
  const renderIt = () =>
    render(
      <MemoryRouter>
        <PeopleYouMayKnow />
      </MemoryRouter>
    );

  it("lists the people, how many friends you share and who", async () => {
    api.suggestions.mockResolvedValue({ suggestions: [suggestion("kai", "Kai", 5, ["Ann", "Bob", "Cara"]), suggestion("max", "Max", 1, ["Ann"])] });
    renderIt();
    expect(await screen.findByRole("heading", { name: "People you may know" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kai" })).toHaveAttribute("href", "/u/kai");
    expect(screen.getByText("5 mutual friends: Ann, Bob, Cara and 2 more")).toBeInTheDocument();
    expect(screen.getByText("1 mutual friend: Ann")).toBeInTheDocument();
  });

  it("shows nothing when there is nobody to suggest, or the suggestions can't be loaded", async () => {
    api.suggestions.mockResolvedValue({ suggestions: [] });
    const { container, unmount } = renderIt();
    await waitFor(() => expect(api.suggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    api.suggestions.mockRejectedValue(new Error("down"));
    const second = renderIt();
    await waitFor(() => expect(api.suggestions).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });

  it("sends a friend request, once, and says so", async () => {
    api.suggestions.mockResolvedValue({ suggestions: [suggestion("kai", "Kai", 2, ["Ann", "Bob"])] });
    api.request.mockResolvedValue({ friendship: {} as never });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(api.request).toHaveBeenCalledWith("kai");
    expect(await screen.findByRole("button", { name: "Request sent" })).toBeDisabled();
  });

  it("shows the server's reason if the request fails", async () => {
    api.suggestions.mockResolvedValue({ suggestions: [suggestion("kai", "Kai", 2, ["Ann", "Bob"])] });
    api.request.mockRejectedValue(new ApiError(409, "Friend request already exists"));
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Friend request already exists");
    expect(screen.getByRole("button", { name: "Add friend" })).toBeEnabled();
  });

  it("takes someone off the list when you say you aren't interested", async () => {
    api.suggestions.mockResolvedValue({ suggestions: [suggestion("kai", "Kai", 2, ["Ann", "Bob"]), suggestion("max", "Max", 1, ["Ann"])] });
    api.dismissSuggestion.mockResolvedValue(undefined);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Not interested in Kai" }));
    expect(api.dismissSuggestion).toHaveBeenCalledWith("kai");
    await waitFor(() => expect(screen.queryByRole("link", { name: "Kai" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Max" })).toBeInTheDocument();
  });

  it("keeps someone on the list, with the reason, if dismissing fails", async () => {
    api.suggestions.mockResolvedValue({ suggestions: [suggestion("kai", "Kai", 2, ["Ann", "Bob"])] });
    api.dismissSuggestion.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Not interested in Kai" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    expect(screen.getByRole("link", { name: "Kai" })).toBeInTheDocument();
  });
});
