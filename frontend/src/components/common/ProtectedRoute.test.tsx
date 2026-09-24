import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "../../context/AuthContext";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const mockedUseAuth = vi.mocked(useAuth);

function renderAt() {
  render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/secret" element={<div>Secret content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const auth = { setUser: () => {}, refresh: async () => {} };

describe("ProtectedRoute", () => {
  it("redirects anonymous visitors to the login page", () => {
    mockedUseAuth.mockReturnValue({ ...auth, user: null, isLoading: false });
    renderAt();
    expect(screen.getByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("waits while the session is being checked instead of redirecting", () => {
    mockedUseAuth.mockReturnValue({ ...auth, user: null, isLoading: true });
    renderAt();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  });

  it("renders the page for a signed-in user", () => {
    mockedUseAuth.mockReturnValue({
      ...auth,
      user: { id: "1", username: "me", displayName: "Me" } as never,
      isLoading: false,
    });
    renderAt();
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
});
