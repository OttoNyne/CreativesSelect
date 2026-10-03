import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { VerifyEmailBanner } from "./VerifyEmailBanner";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { User } from "../../types";

vi.mock("../../api/auth.api", () => ({ authApi: { resendVerification: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(authApi);

const ada = (over: Partial<User> = {}) => ({ id: "u1", username: "ada", displayName: "Ada", email: "ada@example.com", emailVerified: false, ...over }) as User;

function renderBanner(user: User | null, path = "/") {
  vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, setUser: vi.fn(), refresh: vi.fn() });
  render(
    <MemoryRouter initialEntries={[path]}>
      <VerifyEmailBanner />
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.resendVerification.mockReset();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("VerifyEmailBanner", () => {
  it("reminds an unconfirmed person, naming the address the link went to", () => {
    renderBanner(ada());
    const banner = screen.getByRole("region", { name: "Confirm your email" });
    expect(banner).toHaveTextContent("Please confirm your email");
    expect(banner).toHaveTextContent("ada@example.com");
  });

  it("shows nothing to someone who is confirmed, signed out, or whose status isn't known", () => {
    for (const u of [ada({ emailVerified: true }), null, ada({ emailVerified: undefined })]) {
      const { container, unmount } = render(<div />);
      unmount();
      vi.mocked(useAuth).mockReturnValue({ user: u, isLoading: false, setUser: vi.fn(), refresh: vi.fn() });
      const view = render(
        <MemoryRouter>
          <VerifyEmailBanner />
        </MemoryRouter>
      );
      expect(view.container).toBeEmptyDOMElement();
      void container;
    }
  });

  it("stays out of the way on the confirmation page itself", () => {
    renderBanner(ada(), "/verify-email");
    expect(screen.queryByRole("region", { name: "Confirm your email" })).not.toBeInTheDocument();
  });

  it("sends another link and says so", async () => {
    api.resendVerification.mockResolvedValue(undefined);
    renderBanner(ada());
    await userEvent.click(screen.getByRole("button", { name: "Resend email" }));
    expect(api.resendVerification).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Sent — check your inbox");
  });

  it("shows the server's reason when it can't (e.g. too many requests)", async () => {
    api.resendVerification.mockRejectedValue(new ApiError(429, "You've asked for several emails — check your inbox (and spam), or try again in an hour."));
    renderBanner(ada());
    await userEvent.click(screen.getByRole("button", { name: "Resend email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've asked for several emails");
  });

  it("falls back to a generic message for unexpected errors", async () => {
    api.resendVerification.mockRejectedValue(new TypeError("offline"));
    renderBanner(ada());
    await userEvent.click(screen.getByRole("button", { name: "Resend email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't send the email");
  });

  it("can be closed for the visit, and stays closed while they browse", async () => {
    renderBanner(ada());
    await userEvent.click(screen.getByRole("button", { name: "Dismiss this reminder" }));
    expect(screen.queryByRole("region", { name: "Confirm your email" })).not.toBeInTheDocument();
    renderBanner(ada()); // another page in the same visit
    expect(screen.queryByRole("region", { name: "Confirm your email" })).not.toBeInTheDocument();
  });

  it("still closes when storage is blocked, and has a dismiss button big enough to tap", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderBanner(ada());
    expect(screen.getByRole("button", { name: "Dismiss this reminder" }).className).toMatch(/h-10 w-10/);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss this reminder" }));
    expect(screen.queryByRole("region", { name: "Confirm your email" })).not.toBeInTheDocument();
  });
});
