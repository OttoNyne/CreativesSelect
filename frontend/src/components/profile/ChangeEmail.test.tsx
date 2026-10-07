import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeEmail } from "./ChangeEmail";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/auth.api", () => ({ authApi: { requestEmailChange: vi.fn() } }));
const request = vi.mocked(authApi.requestEmailChange);

beforeEach(() => {
  request.mockReset();
});

async function fill(email = "new@example.com", password = "my-password-1") {
  await userEvent.click(screen.getByRole("button", { name: /Change email…/ }));
  await userEvent.type(screen.getByLabelText("New email address"), email);
  await userEvent.type(screen.getByLabelText("Your password"), password);
}

describe("ChangeEmail", () => {
  it("starts collapsed and asks for nothing", () => {
    render(<ChangeEmail />);
    expect(screen.getByRole("button", { name: /Change email…/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("New email address")).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("explains that nothing changes until the link is opened, and keeps Send off until both boxes are filled", async () => {
    render(<ChangeEmail />);
    await userEvent.click(screen.getByRole("button", { name: /Change email…/ }));
    expect(screen.getByText(/Nothing changes until you open it/)).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send the link" });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText("New email address"), "new@example.com");
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    expect(send).toBeEnabled();
  });

  it("sends the request and says where the link went, without having changed anything on the page", async () => {
    request.mockResolvedValue(undefined);
    render(<ChangeEmail />);
    await fill("  new@example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(request).toHaveBeenCalledWith("new@example.com", "my-password-1", undefined);
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("We've sent a link to new@example.com");
    expect(note).toHaveTextContent("Your email changes only then");
    expect(screen.queryByLabelText("Your password")).not.toBeInTheDocument(); // not kept on the page
  });

  it("shows a wrong password, a taken address or a limit as the server words it, and stays on the form", async () => {
    render(<ChangeEmail />);
    await fill();
    for (const [status, message] of [
      [403, "That password isn't right"],
      [409, "That email address is already used by another account"],
      [429, "Too many attempts — please wait a few minutes and try again"],
    ] as const) {
      request.mockRejectedValueOnce(new ApiError(status, message));
      await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByLabelText("New email address")).toHaveValue("new@example.com");
    }
  });

  it("asks for a code when the server says the second step is needed, then sends it with the request", async () => {
    render(<ChangeEmail />);
    await fill();
    expect(screen.queryByLabelText("Code from your app")).not.toBeInTheDocument();
    request.mockRejectedValueOnce(new ApiError(401, "Enter a code from your authenticator app (or a recovery code) to change your email", undefined, "second_step_needed"));
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    await userEvent.type(await screen.findByLabelText("Code from your app"), "123456");
    expect(screen.getByRole("button", { name: "Send the link" })).toBeEnabled();

    request.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(request).toHaveBeenLastCalledWith("new@example.com", "my-password-1", "123456");
    expect(await screen.findByRole("status")).toHaveTextContent("We've sent a link");
  });

  it("keeps Send off in the code step until a code is typed, and shows a wrong code's message", async () => {
    render(<ChangeEmail />);
    await fill();
    request.mockRejectedValueOnce(new ApiError(401, "Enter a code from your authenticator app (or a recovery code) to change your email", undefined, "second_step_needed"));
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    await screen.findByLabelText("Code from your app");
    expect(screen.getByRole("button", { name: "Send the link" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Code from your app"), "000000");
    request.mockRejectedValueOnce(new ApiError(401, "Enter a code from your authenticator app (or a recovery code) to change your email", undefined, "second_step_needed"));
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a code from your authenticator app");
    expect(screen.getByLabelText("Code from your app")).toHaveValue(""); // cleared to try again
  });

  it("falls back to a plain message for anything unexpected", async () => {
    request.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ChangeEmail />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(await screen.findByText("Couldn't ask for the change, try again.")).toBeInTheDocument();
  });

  it("only sends once at a time, and Cancel puts everything away", async () => {
    request.mockImplementation(() => new Promise(() => {}));
    render(<ChangeEmail />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes the form and forgets what was typed", async () => {
    render(<ChangeEmail />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: /Change email…/ }));
    expect(screen.getByLabelText("New email address")).toHaveValue("");
    expect(screen.getByLabelText("Your password")).toHaveValue("");
  });
});
