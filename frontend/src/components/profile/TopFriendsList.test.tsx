import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TopFriendsList } from "./TopFriendsList";
import { profilesApi } from "../../api/profiles.api";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import type { User } from "../../types";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { getTopFriends: vi.fn(), setTopFriends: vi.fn() } }));
vi.mock("../../api/friends.api", () => ({ friendsApi: { list: vi.fn() } }));
const profiles = vi.mocked(profilesApi);

const zoe = { id: "u2", username: "zoe", displayName: "Zoe" } as User;
const kai = { id: "u3", username: "kai", displayName: "Kai" } as User;

function renderList(isOwner = true) {
  render(
    <MemoryRouter>
      <TopFriendsList username="me" isOwner={isOwner} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  profiles.getTopFriends.mockReset();
  profiles.setTopFriends.mockReset();
  vi.mocked(friendsApi.list).mockReset();
  profiles.getTopFriends.mockResolvedValue({ topFriends: [zoe] });
  vi.mocked(friendsApi.list).mockResolvedValue({ friends: [zoe, kai] });
});

describe("TopFriendsList", () => {
  it("shows the current top friends", async () => {
    renderList();
    expect(await screen.findByText("Zoe")).toBeInTheDocument();
  });

  it("saves the new selection and shows the list the server returns (regression: this used to fail with 'Couldn't save your top friends')", async () => {
    profiles.setTopFriends.mockResolvedValue({ topFriends: [zoe, kai] });
    renderList();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.click(await screen.findByText("Kai"));
    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));

    expect(profiles.setTopFriends).toHaveBeenCalledWith(["zoe", "kai"]);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument());
    expect(screen.getByText("Kai")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("alerts with the server's message if saving fails, and stays in edit mode", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    profiles.setTopFriends.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderList();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Internal server error"));
    expect(screen.getByRole("button", { name: /^Save/ })).toBeInTheDocument();
    alertSpy.mockRestore();
  });

  it("shows the empty state when the top friends can't be loaded (e.g. a private profile)", async () => {
    profiles.getTopFriends.mockRejectedValue(new ApiError(403, "This profile is private"));
    renderList(false);
    expect(await screen.findByText(/No top friends picked yet/)).toBeInTheDocument();
  });
});
