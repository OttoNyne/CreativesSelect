import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { LoginPage } from "./LoginPage";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";

vi.mock("../api/auth.api", () => ({ authApi: { forgotPassword: vi.fn(), resetPassword: vi.fn(), login: vi.fn(), resetAvailable: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ setUser: vi.fn() }) }));
const api = vi.mocked(authApi);

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.hash}</div>;
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.resetAvailable.mockResolvedValue({ available: true });
});

describe("login page", () => {
  it("links to the forgot-password page", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("ForgotPasswordPage", () => {
  function renderPage() {
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );
  }

  it("asks the API for a link and then says one is on its way, without confirming the account exists", async () => {
    api.forgotPassword.mockResolvedValue({ message: "ok" });
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "  ada@example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(api.forgotPassword).toHaveBeenCalledWith("ada@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(/If ada@example.com has an account/);
    expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("shows the server's message, e.g. when rate limited, and keeps the form", async () => {
    api.forgotPassword.mockRejectedValue(new ApiError(429, "Too many attempts — please wait a few minutes and try again"));
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("says plainly when the site can't send email yet, instead of showing a form that can't work", async () => {
    api.resetAvailable.mockResolvedValue({ available: false });
    renderPage();
    expect(await screen.findByRole("status")).toHaveTextContent(/isn.t set up on this site yet/);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login");
  });

  it("still shows the form if the availability check itself fails", async () => {
    api.resetAvailable.mockRejectedValue(new Error("offline"));
    renderPage();
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  });

  it("falls back to a generic message for unexpected errors", async () => {
    api.forgotPassword.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});

describe("ResetPasswordPage", () => {
  function renderAt(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<div>Forgot page</div>} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
        <Where />
      </MemoryRouter>
    );
  }
  const fill = async (a: string, b: string) => {
    await userEvent.type(screen.getByLabelText("New password", { exact: true }), a);
    await userEvent.type(screen.getByLabelText("Repeat new password"), b);
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
  };

  it("sends the token from the link with the new password, then offers to log in", async () => {
    api.resetPassword.mockResolvedValue(undefined);
    renderAt("/reset-password#token=abc123");
    await fill("a-brand-new-pass", "a-brand-new-pass");
    expect(api.resetPassword).toHaveBeenCalledWith("abc123", "a-brand-new-pass");
    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("removes the token from the address bar once it has been read", async () => {
    renderAt("/reset-password#token=abc123");
    await screen.findByLabelText("New password", { exact: true });
    expect(screen.getByTestId("where")).toHaveTextContent("/reset-password");
    expect(screen.getByTestId("where").textContent).not.toContain("abc123");
  });

  it("needs the emailed link: without a token it explains and points to a new request", () => {
    renderAt("/reset-password");
    expect(screen.getByRole("heading", { name: "Reset link needed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "request a new one" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password", { exact: true })).not.toBeInTheDocument();
  });

  it("checks the passwords before calling the API: long enough and matching", async () => {
    renderAt("/reset-password#token=abc123");
    await fill("short", "short");
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 8 characters");
    await userEvent.clear(screen.getByLabelText("New password", { exact: true }));
    await userEvent.clear(screen.getByLabelText("Repeat new password"));
    await fill("a-brand-new-pass", "different-pass-1");
    expect(screen.getByRole("alert")).toHaveTextContent("don't match");
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("explains an expired or used link and offers a new one", async () => {
    api.resetPassword.mockRejectedValue(new ApiError(400, "This reset link is invalid or has expired"));
    renderAt("/reset-password#token=old");
    await fill("a-brand-new-pass", "a-brand-new-pass");
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
  });

  it("shows other server errors without the 'new link' suggestion", async () => {
    api.resetPassword.mockRejectedValue(new ApiError(429, "Too many attempts — please wait a few minutes and try again"));
    renderAt("/reset-password#token=abc123");
    await fill("a-brand-new-pass", "a-brand-new-pass");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(screen.queryByRole("link", { name: "Request a new link" })).not.toBeInTheDocument();
  });
});

