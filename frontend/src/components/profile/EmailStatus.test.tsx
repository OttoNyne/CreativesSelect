import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailStatus } from "./EmailStatus";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { User } from "../../types";

vi.mock("../../api/auth.api", () => ({ authApi: { resendVerification: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(authApi);

const withUser = (over: Partial<User>) =>
  vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "ada", email: "ada@example.com", emailVerified: false, ...over } as User, isLoading: false, setUser: vi.fn(), refresh: vi.fn() });

beforeEach(() => {
  api.resendVerification.mockReset();
});

describe("EmailStatus", () => {
  it("shows a confirmed address with a tick, and nothing to do", () => {
    withUser({ emailVerified: true });
    render(<EmailStatus />);
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("✓ Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says when it isn't confirmed and lets them send the email again", async () => {
    api.resendVerification.mockResolvedValue(undefined);
    withUser({ emailVerified: false });
    render(<EmailStatus />);
    expect(screen.getByText("Not confirmed yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send confirmation email" }));
    expect(api.resendVerification).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Sent — check your inbox");
  });

  it("shows why it couldn't send", async () => {
    api.resendVerification.mockRejectedValue(new ApiError(503, "Email isn't set up on this site yet."));
    withUser({ emailVerified: false });
    render(<EmailStatus />);
    await userEvent.click(screen.getByRole("button", { name: "Send confirmation email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email isn't set up on this site yet.");
  });

  it("shows nothing when the account's email status isn't known", () => {
    withUser({ emailVerified: undefined });
    const { container } = render(<EmailStatus />);
    expect(container).toBeEmptyDOMElement();
  });
});
