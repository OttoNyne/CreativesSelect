import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileNames } from "./ProfileNames";
import { profilesApi } from "../../api/profiles.api";
import { ApiError } from "../../api/client";
import type { User } from "../../types";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { updateMe: vi.fn(), changeUsername: vi.fn() } }));
const api = vi.mocked(profilesApi);
const me = { id: "me", username: "alice", displayName: "Alice" } as User;

function setup() {
  const onChanged = vi.fn();
  render(<ProfileNames profile={me} onChanged={onChanged} />);
  return onChanged;
}

beforeEach(() => {
  api.updateMe.mockReset();
  api.changeUsername.mockReset();
});

describe("ProfileNames: display name", () => {
  it("starts with the current name and nothing to save", () => {
    setup();
    expect(screen.getByLabelText("Display name")).toHaveValue("Alice");
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
  });

  it("saves a new name (trimmed) and reports the updated profile", async () => {
    api.updateMe.mockResolvedValue({ user: { ...me, displayName: "Alice the Painter" } });
    const onChanged = setup();
    const input = screen.getByLabelText("Display name");
    await userEvent.clear(input);
    await userEvent.type(input, "  Alice the Painter ");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(api.updateMe).toHaveBeenCalledWith({ displayName: "Alice the Painter" });
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Alice the Painter" }));
    expect(await screen.findByText("Display name updated ✓")).toBeInTheDocument();
  });

  it("won't save a blank name", async () => {
    const onChanged = setup();
    await userEvent.clear(screen.getByLabelText("Display name"));
    await userEvent.type(screen.getByLabelText("Display name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Display name can't be empty.")).toBeInTheDocument();
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows the server's message if saving fails", async () => {
    api.updateMe.mockRejectedValue(new ApiError(400, "Display name must be 80 characters or fewer"));
    setup();
    await userEvent.type(screen.getByLabelText("Display name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText(/80 characters or fewer/)).toBeInTheDocument();
  });
});

describe("ProfileNames: username", () => {
  it("shows the current username and the address it controls", () => {
    setup();
    expect(screen.getByLabelText(/^Username/)).toHaveValue("alice");
    expect(screen.getByText(/\/u\/alice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change username" })).toBeDisabled();
  });

  it("changes the username and reports the updated profile (so the page can move to the new address)", async () => {
    api.changeUsername.mockResolvedValue({ user: { ...me, username: "alice_paints" } });
    const onChanged = setup();
    const input = screen.getByLabelText(/^Username/);
    await userEvent.clear(input);
    await userEvent.type(input, "Alice_Paints");
    await userEvent.click(screen.getByRole("button", { name: "Change username" }));

    expect(api.changeUsername).toHaveBeenCalledWith("Alice_Paints");
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ username: "alice_paints" }));
  });

  it("rejects an unsuitable username before calling the server", async () => {
    setup();
    const input = screen.getByLabelText(/^Username/);
    for (const bad of ["ab", "has space", "a.b", "émile"]) {
      await userEvent.clear(input);
      await userEvent.type(input, bad);
      await userEvent.click(screen.getByRole("button", { name: "Change username" }));
      expect(await screen.findByText(/^Username must be 3–30 letters, numbers or underscores./)).toBeInTheDocument();
    }
    expect(api.changeUsername).not.toHaveBeenCalled();
  });

  it("shows the server's message when the name is taken, and stays editable", async () => {
    api.changeUsername.mockRejectedValue(new ApiError(409, "That username is already taken"));
    const onChanged = setup();
    const input = screen.getByLabelText(/^Username/);
    await userEvent.clear(input);
    await userEvent.type(input, "bobby");
    await userEvent.click(screen.getByRole("button", { name: "Change username" }));

    expect(await screen.findByText("That username is already taken")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Change username" })).toBeEnabled();
  });

  it("explains the rules up front", () => {
    setup();
    expect(screen.getByText(/3 times a day/)).toBeInTheDocument();
    expect(screen.getByText(/reserved for you for 30 days/)).toBeInTheDocument();
  });
});
