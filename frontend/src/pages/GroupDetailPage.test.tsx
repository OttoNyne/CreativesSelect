import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GroupDetailPage } from "./GroupDetailPage";
import { groupsApi } from "../api/groups.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Group, GroupMember, User } from "../types";

vi.mock("../api/groups.api", () => ({ groupsApi: { get: vi.fn(), members: vi.fn(), join: vi.fn(), leave: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(groupsApi);

const group = { id: "g1", name: "Painters", description: "We paint", memberCount: 2, isMember: false } as Group;
const admin: GroupMember = { role: "admin", joinedAt: "", user: { id: "u1", username: "ada", displayName: "Ada" } as User };
const member: GroupMember = { role: "member", joinedAt: "", user: { id: "u2", username: "zoe", displayName: "Zoe" } as User };

function renderAs(username: string | null) {
  vi.mocked(useAuth).mockReturnValue({
    user: username ? ({ id: "x", username } as User) : null,
    isLoading: false,
    setUser: () => {},
    refresh: async () => {},
  });
  render(
    <MemoryRouter initialEntries={["/groups/g1"]}>
      <Routes>
        <Route path="/groups/:id" element={<GroupDetailPage />} />
        <Route path="/u/:username" element={<div>Profile page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ group });
  api.members.mockResolvedValue({ members: [admin, member] });
});

describe("GroupDetailPage", () => {
  it("shows the group, its member count, and who is in it (marking admins)", async () => {
    renderAs("someone");
    expect(await screen.findByRole("heading", { name: "Painters" })).toBeInTheDocument();
    expect(screen.getByText("We paint")).toBeInTheDocument();
    expect(screen.getByText("2 members")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByText("Admin")).toBeInTheDocument(); // Zoe is a plain member
  });

  it("offers Join to a non-member, and reloads the roster after joining", async () => {
    api.join.mockResolvedValue(undefined);
    renderAs("someone");
    await userEvent.click(await screen.findByRole("button", { name: "Join group" }));

    expect(api.join).toHaveBeenCalledWith("g1");
    await waitFor(() => expect(api.members).toHaveBeenCalledTimes(2));
  });

  it("offers Leave to a member", async () => {
    api.leave.mockResolvedValue(undefined);
    renderAs("zoe");
    await userEvent.click(await screen.findByRole("button", { name: "Leave group" }));
    expect(api.leave).toHaveBeenCalledWith("g1");
    expect(screen.queryByRole("button", { name: "Join group" })).not.toBeInTheDocument();
  });

  it("shows the server's message if joining fails, keeping the page", async () => {
    api.join.mockRejectedValue(new ApiError(409, "Already a member"));
    renderAs("someone");
    await userEvent.click(await screen.findByRole("button", { name: "Join group" }));
    expect(await screen.findByText("Already a member")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Painters" })).toBeInTheDocument();
  });

  it("shows the server's message if leaving fails", async () => {
    api.leave.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderAs("zoe");
    await userEvent.click(await screen.findByRole("button", { name: "Leave group" }));
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });

  it("links each member to their profile", async () => {
    renderAs("someone");
    await userEvent.click(await screen.findByRole("link", { name: "Zoe" }));
    expect(await screen.findByText("Profile page")).toBeInTheDocument();
  });

  it("shows an error for a group that doesn't exist or can't be loaded", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Group not found"));
    renderAs("someone");
    expect(await screen.findByText("Group not found")).toBeInTheDocument();
  });

  it("falls back to a generic message for unexpected load errors", async () => {
    api.members.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAs("someone");
    expect(await screen.findByText("Failed to load this group.")).toBeInTheDocument();
  });
});
