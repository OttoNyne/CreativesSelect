import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePassword } from "./ChangePassword";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/auth.api", () => ({ authApi: { changePassword: vi.fn() } }));
const changePassword = vi.mocked(authApi.changePassword);

beforeEach(() => {
  changePassword.mockReset();
});

async function fill(current: string, next: string, confirm: string) {
  await userEvent.click(screen.getByRole("button", { name: /Change password/ }));
  await userEvent.type(screen.getByPlaceholderText("Current password"), current);
  await userEvent.type(screen.getByPlaceholderText(/New password/), next);
  await userEvent.type(screen.getByPlaceholderText("Confirm new password"), confirm);
}

describe("ChangePassword", () => {
  it("starts collapsed", () => {
    render(<ChangePassword />);
    expect(screen.queryByPlaceholderText("Current password")).not.toBeInTheDocument();
  });

  it("changes the password, then collapses with a confirmation", async () => {
    changePassword.mockResolvedValue(undefined);
    render(<ChangePassword />);
    await fill("old-password-1", "a-much-better-one", "a-much-better-one");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(changePassword).toHaveBeenCalledWith("old-password-1", "a-much-better-one");
    expect(await screen.findByText("Password changed ✓")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Current password")).not.toBeInTheDocument();
  });

  it("checks length and confirmation before calling the server", async () => {
    render(<ChangePassword />);
    await fill("old-password-1", "short", "short");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/at least 8 characters/)).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText(/New password/));
    await userEvent.type(screen.getByPlaceholderText(/New password/), "long-enough-1");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/don't match/)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows the server's message for a wrong current password and stays open", async () => {
    changePassword.mockRejectedValue(new ApiError(403, "Current password is incorrect"));
    render(<ChangePassword />);
    await fill("wrong-wrong", "a-much-better-one", "a-much-better-one");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Current password")).toBeInTheDocument();
  });

  it("Cancel closes it and clears the fields", async () => {
    render(<ChangePassword />);
    await fill("abc", "def", "ghi");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: /Change password/ }));
    expect(screen.getByPlaceholderText("Current password")).toHaveValue("");
  });
});
