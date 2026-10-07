import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ConfirmEmailChangePage, UndoEmailChangePage } from "./EmailChangePages";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

vi.mock("../api/auth.api", () => ({ authApi: { confirmEmailChange: vi.fn(), revertEmailChange: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const confirm = vi.mocked(authApi.confirmEmailChange);
const revert = vi.mocked(authApi.revertEmailChange);
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
        <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
        <Route path="/undo-email-change" element={<UndoEmailChangePage />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
}

beforeEach(() => {
  confirm.mockReset();
  revert.mockReset();
  refresh.mockReset();
});

describe("the link from the new address", () => {
  it("makes the change as soon as it opens, using the token in the address, and removes it from the address bar", async () => {
    confirm.mockResolvedValue(undefined);
    renderAt("/confirm-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("heading", { name: "Email changed" })).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith("abc123def456abc123def456");
    expect(screen.getByTestId("where")).toHaveTextContent("/confirm-email-change");
    expect(screen.getByTestId("where").textContent).not.toContain("token");
    expect(refresh).toHaveBeenCalled(); // so a signed-in person sees the new address
  });

  it("offers a way to log in when no one is signed in, and the feed when someone is", async () => {
    confirm.mockResolvedValue(undefined);
    renderAt("/confirm-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("goes to the feed for someone already signed in", async () => {
    confirm.mockResolvedValue(undefined);
    renderAt("/confirm-email-change#token=abc123def456abc123def456", { id: "1", username: "zoe" } as User);
    expect(await screen.findByRole("link", { name: "Go to your feed" })).toHaveAttribute("href", "/");
  });

  it("says why it failed, in the server's words", async () => {
    confirm.mockRejectedValue(new ApiError(400, "This link is invalid or has expired"));
    renderAt("/confirm-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("heading", { name: "Couldn't change your email" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This link is invalid or has expired");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says when the address is already taken", async () => {
    confirm.mockRejectedValue(new ApiError(409, "That email address is already used by another account"));
    renderAt("/confirm-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("alert")).toHaveTextContent("already used by another account");
  });

  it("asks for the link when opened without one, and sends nothing", async () => {
    renderAt("/confirm-email-change");
    expect(screen.getByRole("heading", { name: "Link needed" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/link from the email we sent to your new address/);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("uses the link once, even if the page redraws", async () => {
    confirm.mockResolvedValue(undefined);
    renderAt("/confirm-email-change#token=abc123def456abc123def456");
    await screen.findByRole("heading", { name: "Email changed" });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  });

  it("falls back to a plain message for anything unexpected", async () => {
    confirm.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/confirm-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong — please try again.");
  });
});

describe("the link from the old address", () => {
  it("puts the address back, says every device was signed out, and points to choosing a new password", async () => {
    revert.mockResolvedValue(undefined);
    renderAt("/undo-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("heading", { name: "Your old email is back" })).toBeInTheDocument();
    expect(revert).toHaveBeenCalledWith("abc123def456abc123def456");
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/every device has been signed out/);
    expect(screen.getByRole("link", { name: "Choose a new password" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByTestId("where").textContent).not.toContain("token");
  });

  it("says why it failed", async () => {
    revert.mockRejectedValue(new ApiError(400, "This link is invalid or has expired"));
    renderAt("/undo-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("heading", { name: "Couldn't put your old email back" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("invalid or has expired");
  });

  it("says when the old address is now someone else's", async () => {
    revert.mockRejectedValue(new ApiError(409, "That address is now used by another account, so it can't be put back. Contact the site's team."));
    renderAt("/undo-email-change#token=abc123def456abc123def456");
    expect(await screen.findByRole("alert")).toHaveTextContent("Contact the site's team");
  });

  it("asks for the link when opened without one", async () => {
    renderAt("/undo-email-change");
    expect(screen.getByRole("alert")).toHaveTextContent(/link from the email we sent to your old address/);
    expect(revert).not.toHaveBeenCalled();
  });
});
