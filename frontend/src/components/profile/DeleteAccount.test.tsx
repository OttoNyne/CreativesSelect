import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DeleteAccount } from "./DeleteAccount";
import { profilesApi } from "../../api/profiles.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { deleteMe: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const deleteMe = vi.mocked(profilesApi.deleteMe);
const setUser = vi.fn();

function renderIt() {
  render(
    <MemoryRouter initialEntries={["/u/me"]}>
      <Routes>
        <Route path="/u/me" element={<DeleteAccount />} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  deleteMe.mockReset();
  setUser.mockReset();
  vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, setUser, refresh: async () => {} });
});

describe("DeleteAccount", () => {
  it("starts collapsed and needs a deliberate second step", async () => {
    renderIt();
    expect(screen.queryByPlaceholderText(/password/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeDisabled();
    expect(deleteMe).not.toHaveBeenCalled();
  });

  it("deletes with the password, clears the session and goes to login", async () => {
    deleteMe.mockResolvedValue(undefined);
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    await userEvent.type(screen.getByPlaceholderText(/password/i), "hunter22hunter");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(deleteMe).toHaveBeenCalledWith("hunter22hunter");
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(null));
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("shows the server's message for a wrong password and stays put", async () => {
    deleteMe.mockRejectedValue(new ApiError(403, "Incorrect password"));
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    await userEvent.type(screen.getByPlaceholderText(/password/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  });

  it("Cancel closes the panel and forgets what was typed", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    await userEvent.type(screen.getByPlaceholderText(/password/i), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    expect(screen.getByPlaceholderText(/password/i)).toHaveValue("");
  });
});
