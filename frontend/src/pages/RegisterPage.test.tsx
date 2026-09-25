import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RegisterPage } from "./RegisterPage";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

vi.mock("../api/auth.api", () => ({ authApi: { register: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const register = vi.mocked(authApi.register);
const setUser = vi.fn();

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div>Home feed</div>} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fill(display = "Sam Painter", username = "sam_paints", email = "sam@example.com", password = "long-enough-1") {
  await userEvent.type(screen.getByPlaceholderText("Display name"), display);
  await userEvent.type(screen.getByPlaceholderText("Username"), username);
  await userEvent.type(screen.getByPlaceholderText("Email"), email);
  await userEvent.type(screen.getByPlaceholderText("Password (min 8 characters)"), password);
}

beforeEach(() => {
  register.mockReset();
  setUser.mockReset();
  vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, setUser, refresh: async () => {} });
});

describe("RegisterPage", () => {
  it("creates the account, signs the user in, and goes to the feed", async () => {
    const user = { id: "1", username: "sam_paints", displayName: "Sam Painter" } as User;
    register.mockResolvedValue({ user });
    renderPage();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(register).toHaveBeenCalledWith({
      displayName: "Sam Painter",
      username: "sam_paints",
      email: "sam@example.com",
      password: "long-enough-1",
    });
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(user));
    expect(await screen.findByText("Home feed")).toBeInTheDocument();
  });

  it("tells people which usernames are allowed, before they type", () => {
    renderPage();
    expect(screen.getByText(/3–30 letters, numbers or underscores/)).toBeInTheDocument();
    const username = screen.getByPlaceholderText("Username");
    expect(username).toHaveAttribute("pattern", "[A-Za-z0-9_]+");
    expect(username).toHaveAttribute("maxlength", "30");
  });

  it("strips spaces out of the username as you type", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Username"), "my user name");
    expect(screen.getByPlaceholderText("Username")).toHaveValue("myusername");
  });

  it("requires an 8+ character password", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Password (min 8 characters)")).toHaveAttribute("minlength", "8");
  });

  it("shows the server's message when the name or email is taken, and stays editable", async () => {
    register.mockRejectedValue(new ApiError(409, "Email or username already taken"));
    renderPage();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText("Email or username already taken")).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeEnabled();
    expect(screen.getByPlaceholderText("Display name")).toHaveValue("Sam Painter"); // nothing lost
  });

  it("blocks an unsuitable username in the browser before it reaches the server", async () => {
    renderPage();
    await fill("Sam", "a.b");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Username")).toBeInvalid();
  });

  it("shows the server's message when it rejects a username the browser allowed", async () => {
    register.mockRejectedValue(new ApiError(409, "Email or username already taken"));
    renderPage();
    await fill("Sam", "sam_2");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("Email or username already taken")).toBeInTheDocument();
  });

  it("shows the throttling message and falls back to a generic one for unexpected errors", async () => {
    register.mockRejectedValueOnce(new ApiError(429, "Too many attempts — please wait a few minutes and try again"));
    renderPage();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();

    register.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("links to log in", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("link", { name: "Log in" }));
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });
});
