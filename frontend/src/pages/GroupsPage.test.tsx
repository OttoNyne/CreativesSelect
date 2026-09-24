import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { GroupsPage } from "./GroupsPage";
import { groupsApi } from "../api/groups.api";
import { ApiError } from "../api/client";
import type { Group } from "../types";

vi.mock("../api/groups.api", () => ({
  groupsApi: { list: vi.fn(), create: vi.fn(), join: vi.fn(), leave: vi.fn() },
}));
const api = vi.mocked(groupsApi);

const painters = { id: "g1", name: "Painters", description: "We paint", memberCount: 3, isMember: false } as Group;
const potters = { id: "g2", name: "Potters", description: "We throw", memberCount: 1, isMember: true } as Group;

function renderPage() {
  render(
    <MemoryRouter>
      <GroupsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.list.mockResolvedValue({ groups: [painters, potters] });
});

describe("GroupsPage", () => {
  it("lists groups with member counts and Join/Leave per membership", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Painters" })).toHaveAttribute("href", "/groups/g1");
    expect(screen.getByText("3 members")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Join" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Leave" })).toHaveLength(1);
  });

  it("joins and leaves, then reloads", async () => {
    api.join.mockResolvedValue(undefined);
    api.leave.mockResolvedValue(undefined);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(api.join).toHaveBeenCalledWith("g1");
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    expect(api.leave).toHaveBeenCalledWith("g2");
    await vi.waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("searches by the typed text", async () => {
    renderPage();
    await userEvent.type(await screen.findByPlaceholderText("Search groups…"), "paint{enter}");
    expect(api.list).toHaveBeenLastCalledWith("paint");
  });

  it("creates a group from the form, trimming the name", async () => {
    api.create.mockResolvedValue({ group: painters });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "+ New group" }));
    await userEvent.type(screen.getByPlaceholderText("Group name"), "  Sculptors ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(api.create).toHaveBeenCalledWith({ name: "Sculptors", description: undefined });
  });

  it("won't create a group with a blank name", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "+ New group" }));
    await userEvent.type(screen.getByPlaceholderText("Group name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(api.create).not.toHaveBeenCalled();
  });

  it("shows an action error without losing the list", async () => {
    api.join.mockRejectedValue(new ApiError(409, "Already a member"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(await screen.findByText("Already a member")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Painters" })).toBeInTheDocument();
  });

  it("says so when there are no groups, and shows load errors", async () => {
    api.list.mockResolvedValue({ groups: [] });
    renderPage();
    expect(await screen.findByText("No groups found.")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    api.list.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPage();
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });
});
