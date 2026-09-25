import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import type { User } from "../types";

vi.mock("../api/auth.api", () => ({ authApi: { me: vi.fn() } }));
const me = vi.mocked(authApi.me);

function Probe() {
  const { user, isLoading, setUser, refresh } = useAuth();
  return (
    <div>
      <p>{isLoading ? "loading" : "ready"}</p>
      <p>{user ? `signed in as ${user.username}` : "signed out"}</p>
      <button onClick={() => setUser({ id: "2", username: "kai" } as User)}>set kai</button>
      <button onClick={() => refresh()}>refresh</button>
    </div>
  );
}

beforeEach(() => {
  me.mockReset();
});

describe("AuthProvider / useAuth", () => {
  it("checks the session on load: loading first, then signed in", async () => {
    me.mockResolvedValue({ user: { id: "1", username: "sam" } as User });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("signed in as sam")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("treats a rejected session check (not logged in) as signed out, and stops loading", async () => {
    me.mockRejectedValue(new ApiError(401, "Not authenticated"));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("signed out")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("treats a network failure the same way instead of hanging", async () => {
    me.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("signed out")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("lets pages set the user after login, and refresh re-checks the session", async () => {
    me.mockRejectedValueOnce(new ApiError(401, "Not authenticated"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("signed out");

    await userEvent.click(screen.getByText("set kai"));
    expect(screen.getByText("signed in as kai")).toBeInTheDocument();

    me.mockResolvedValueOnce({ user: { id: "1", username: "sam" } as User });
    await userEvent.click(screen.getByText("refresh"));
    await waitFor(() => expect(screen.getByText("signed in as sam")).toBeInTheDocument());
  });

  it("refuses to be used outside its provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/within AuthProvider/);
    spy.mockRestore();
  });
});
