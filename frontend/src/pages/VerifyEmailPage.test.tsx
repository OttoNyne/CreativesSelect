import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

vi.mock("../api/auth.api", () => ({ authApi: { verifyEmail: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(authApi);
const refresh = vi.fn();

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.hash}</div>;
}
function renderAt(path: string, user: User | null = null) {
  vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, setUser: vi.fn(), refresh });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.verifyEmail.mockReset();
  refresh.mockReset();
  refresh.mockResolvedValue(undefined);
});

describe("VerifyEmailPage", () => {
  it("confirms the address as soon as it opens, using the token from the link", async () => {
    api.verifyEmail.mockResolvedValue(undefined);
    renderAt("/verify-email#token=abc123");
    expect(await screen.findByRole("heading", { name: "Email confirmed" })).toBeInTheDocument();
    expect(api.verifyEmail).toHaveBeenCalledTimes(1);
    expect(api.verifyEmail).toHaveBeenCalledWith("abc123");
  });

  it("shows that it's working while it waits", () => {
    api.verifyEmail.mockReturnValue(new Promise(() => {}));
    renderAt("/verify-email#token=abc123");
    expect(screen.getByRole("heading", { name: "Confirming your email…" })).toBeInTheDocument();
  });

  it("removes the token from the address bar once it has been read", async () => {
    api.verifyEmail.mockResolvedValue(undefined);
    renderAt("/verify-email#token=abc123");
    await screen.findByRole("heading", { name: "Email confirmed" });
    expect(screen.getByTestId("where").textContent).toBe("/verify-email");
  });

  it("refreshes a signed-in person's account so their reminder goes away, and offers the feed", async () => {
    api.verifyEmail.mockResolvedValue(undefined);
    renderAt("/verify-email#token=abc123", { id: "u1", username: "ada" } as User);
    expect(await screen.findByRole("link", { name: "Go to your feed" })).toHaveAttribute("href", "/");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("offers to log in when nobody is signed in", async () => {
    api.verifyEmail.mockResolvedValue(undefined);
    renderAt("/verify-email#token=abc123");
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("explains an expired or used link, with what to do next", async () => {
    api.verifyEmail.mockRejectedValue(new ApiError(400, "This verification link is invalid or has expired"));
    renderAt("/verify-email#token=old");
    expect(await screen.findByRole("heading", { name: "Couldn't confirm your email" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("invalid or has expired");
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });

  it("points a signed-in person to the reminder when the link failed", async () => {
    api.verifyEmail.mockRejectedValue(new ApiError(400, "This verification link is invalid or has expired"));
    renderAt("/verify-email#token=old", { id: "u1", username: "ada" } as User);
    expect(await screen.findByText(/ask for a new link from the reminder/)).toBeInTheDocument();
  });

  it("falls back to a generic message for unexpected errors", async () => {
    api.verifyEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/verify-email#token=abc123");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("needs the emailed link: without a token it explains and asks for nothing from the server", () => {
    renderAt("/verify-email");
    expect(screen.getByRole("heading", { name: "Confirmation link needed" })).toBeInTheDocument();
    expect(api.verifyEmail).not.toHaveBeenCalled();
  });
});

describe("VerifyEmailPage: a second link opened on the same page", () => {
  it("confirms with the new link after the first one failed", async () => {
    api.verifyEmail.mockRejectedValueOnce(new ApiError(400, "This verification link is invalid or has expired")).mockResolvedValueOnce(undefined);
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, setUser: vi.fn(), refresh });
    function Jump() {
      const nav = useNavigate();
      return <button onClick={() => nav("/verify-email#token=second")}>open-second-link</button>;
    }
    render(
      <MemoryRouter initialEntries={["/verify-email#token=first"]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
        <Jump />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Couldn't confirm your email" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("open-second-link"));
    expect(await screen.findByRole("heading", { name: "Email confirmed" })).toBeInTheDocument();
    expect(api.verifyEmail).toHaveBeenNthCalledWith(1, "first");
    expect(api.verifyEmail).toHaveBeenNthCalledWith(2, "second");
  });
});
