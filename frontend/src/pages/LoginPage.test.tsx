import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

vi.mock("../api/auth.api", () => ({ authApi: { login: vi.fn(), loginTwoFactor: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const login = vi.mocked(authApi.login);
const loginTwoFactor = vi.mocked(authApi.loginTwoFactor);
const setUser = vi.fn();

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home feed</div>} />
        <Route path="/register" element={<div>Register screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  login.mockReset();
  loginTwoFactor.mockReset();
  setUser.mockReset();
  vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, setUser, refresh: async () => {} });
});

describe("LoginPage", () => {
  it("shows the form and never advertises a shared demo password", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Log in/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "password");
    expect(document.body.textContent).not.toMatch(/password123|demo account/i);
  });

  it("signs in, remembers the user, and goes to the feed", async () => {
    const user = { id: "1", username: "sam", displayName: "Sam" } as User;
    login.mockResolvedValue({ user });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Email"), "sam@example.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(login).toHaveBeenCalledWith({ email: "sam@example.com", password: "hunter2hunter2" });
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(user));
    expect(await screen.findByText("Home feed")).toBeInTheDocument();
  });

  it("shows the server's message for a wrong password and stays on the page", async () => {
    login.mockRejectedValue(new ApiError(401, "Invalid email or password"));
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Email"), "sam@example.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "nope-nope");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Home feed")).not.toBeInTheDocument();
  });

  it("shows the throttling message when there have been too many attempts", async () => {
    login.mockRejectedValue(new ApiError(429, "Too many attempts — please wait a few minutes and try again"));
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Email"), "sam@example.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "whatever1");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
  });

  it("falls back to a generic message for unexpected errors, and can be retried", async () => {
    login.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ user: { id: "1", username: "sam" } as User });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Email"), "sam@example.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Home feed")).toBeInTheDocument();
  });

  it("links to sign-up", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("link", { name: "Sign up" }));
    expect(await screen.findByText("Register screen")).toBeInTheDocument();
  });
});

describe("LoginPage: two-step sign-in", () => {
  async function passwordStep() {
    login.mockResolvedValue({ twoFactorRequired: true, challenge: "the-note" });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Email"), "sam@example.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("heading", { name: "Two-step sign-in" });
  }

  it("asks for the code after a right password, without signing anyone in yet", async () => {
    await passwordStep();
    expect(screen.getByLabelText("Code from your app")).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByText(/Type one of your recovery codes here instead/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("signs in with the code and the note from the password step", async () => {
    await passwordStep();
    const user = { id: "1", username: "sam", displayName: "Sam" } as User;
    loginTwoFactor.mockResolvedValue({ user, recoveryCodesLeft: 8 });
    await userEvent.type(screen.getByLabelText("Code from your app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(loginTwoFactor).toHaveBeenCalledWith("the-note", "123456");
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(user));
    expect(await screen.findByText("Home feed")).toBeInTheDocument();
  });

  it("takes a recovery code in the same box", async () => {
    await passwordStep();
    loginTwoFactor.mockResolvedValue({ user: { id: "1" } as User, recoveryCodesLeft: 7 });
    await userEvent.type(screen.getByLabelText("Code from your app"), "abcde-fghjk");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(loginTwoFactor).toHaveBeenCalledWith("the-note", "abcde-fghjk");
  });

  it("shows a wrong code, clears the box and lets them try again", async () => {
    await passwordStep();
    loginTwoFactor.mockRejectedValueOnce(new ApiError(401, "That code didn't work. Check the code in your app, or use a recovery code."));
    await userEvent.type(screen.getByLabelText("Code from your app"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work");
    expect(screen.getByLabelText("Code from your app")).toHaveValue("");
    expect(setUser).not.toHaveBeenCalled();

    loginTwoFactor.mockResolvedValueOnce({ user: { id: "1" } as User, recoveryCodesLeft: 8 });
    await userEvent.type(screen.getByLabelText("Code from your app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Home feed")).toBeInTheDocument();
  });

  it("goes back to the password when the note has run out, with the reason", async () => {
    await passwordStep();
    loginTwoFactor.mockRejectedValue(new ApiError(401, "That sign-in took too long — please log in again.", undefined, "challenge_expired"));
    await userEvent.type(screen.getByLabelText("Code from your app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByPlaceholderText("Password")).toHaveValue("");
    expect(screen.getByText(/took too long/)).toBeInTheDocument();
  });

  it("shows the throttling message after too many wrong codes", async () => {
    await passwordStep();
    loginTwoFactor.mockRejectedValue(new ApiError(429, "Too many attempts — please wait a few minutes and try again"));
    await userEvent.type(screen.getByLabelText("Code from your app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Too many attempts/);
  });

  it("can go back to the start, forgetting the password and the note", async () => {
    await passwordStep();
    await userEvent.click(screen.getByRole("button", { name: "Back to log in" }));
    expect(screen.getByPlaceholderText("Password")).toHaveValue("");
    await userEvent.type(screen.getByPlaceholderText("Password"), "hunter2hunter2");
    login.mockResolvedValue({ user: { id: "1" } as User });
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(loginTwoFactor).not.toHaveBeenCalled();
    expect(await screen.findByText("Home feed")).toBeInTheDocument();
  });
});
