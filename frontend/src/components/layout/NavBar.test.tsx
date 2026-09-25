import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NavBar } from "./NavBar";
import { authApi } from "../../api/auth.api";
import { useAuth } from "../../context/AuthContext";
import type { User } from "../../types";

vi.mock("../../api/auth.api", () => ({ authApi: { logout: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("./NotificationBell", () => ({ NotificationBell: () => <span>bell</span> }));
const logout = vi.mocked(authApi.logout);
const setUser = vi.fn();
const sam = { id: "1", username: "sam", displayName: "Sam Painter" } as User;

function renderBar(user: User | null) {
  vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, setUser, refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={["/friends"]}>
      <NavBar />
      <Routes>
        <Route path="*" element={<div>page</div>} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  logout.mockReset();
  setUser.mockReset();
});

describe("NavBar", () => {
  it("offers Log in and Sign up when signed out, and no app links", () => {
    renderBar(null);
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
    expect(screen.queryByRole("link", { name: "Help wanted" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("shows every section, the user's own profile link and the bell when signed in", () => {
    renderBar(sam);
    for (const [label, href] of [["Feed", "/"], ["Friends", "/friends"], ["Groups", "/groups"], ["Search", "/search"], ["Help wanted", "/help-wanted"]]) {
      expect(screen.getAllByRole("link", { name: label })[0]).toHaveAttribute("href", href);
    }
    expect(screen.getAllByRole("link", { name: /Sam Painter/ })[0]).toHaveAttribute("href", "/u/sam");
    expect(screen.getAllByText("bell").length).toBeGreaterThan(0);
  });

  it("has a phone menu that opens and closes with the ☰ button", async () => {
    renderBar(sam);
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The dropdown adds a second copy of each link (the desktop row is hidden by CSS only).
    expect(screen.getAllByRole("link", { name: "Groups" })).toHaveLength(2);

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { name: "Groups" })).toHaveLength(1);
  });

  it("closes the phone menu after choosing a page", async () => {
    renderBar(sam);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    await userEvent.click(screen.getAllByRole("link", { name: "Groups" })[1]);
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("logs out: tells the server, clears the session, and goes to the login page", async () => {
    logout.mockResolvedValue(undefined);
    renderBar(sam);
    await userEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]);

    expect(logout).toHaveBeenCalled();
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(null));
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("still logs the user out on this device if the server call fails", async () => {
    logout.mockRejectedValue(new TypeError("Failed to fetch"));
    renderBar(sam);
    await userEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]);

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(null));
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("logs out from the phone menu too", async () => {
    logout.mockResolvedValue(undefined);
    renderBar(sam);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    const buttons = screen.getAllByRole("button", { name: "Log out" });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(null));
  });
});
