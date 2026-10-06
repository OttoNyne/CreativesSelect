import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TwoFactorSettings } from "./TwoFactorSettings";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { qrCodeFor } from "../../lib/share";

vi.mock("../../api/auth.api", () => ({
  authApi: { twoFactorStatus: vi.fn(), twoFactorSetup: vi.fn(), twoFactorEnable: vi.fn(), twoFactorDisable: vi.fn(), twoFactorNewRecoveryCodes: vi.fn() },
}));
vi.mock("../../lib/share", () => ({ qrCodeFor: vi.fn() }));
const status = vi.mocked(authApi.twoFactorStatus);
const setup = vi.mocked(authApi.twoFactorSetup);
const enable = vi.mocked(authApi.twoFactorEnable);
const disable = vi.mocked(authApi.twoFactorDisable);
const newCodes = vi.mocked(authApi.twoFactorNewRecoveryCodes);
const qr = vi.mocked(qrCodeFor);

const SECRET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CODES = ["abcde-fghjk", "mnpqr-stuvw", "xyz23-45678", "99999-88888", "aaaaa-bbbbb", "ccccc-ddddd", "eeeee-fffff", "ggggg-hhhhh"];

beforeEach(() => {
  for (const m of [status, setup, enable, disable, newCodes, qr]) m.mockReset();
  qr.mockResolvedValue("data:image/png;base64,AAAA");
});

async function open() {
  await userEvent.click(screen.getByRole("button", { name: /Two-step sign-in…/ }));
}

async function throughSetup() {
  status.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
  setup.mockResolvedValue({ secret: SECRET, otpauthUrl: `otpauth://totp/x?secret=${SECRET}` });
  render(<TwoFactorSettings />);
  await open();
  await userEvent.click(await screen.findByRole("button", { name: "Turn on two-step sign-in" }));
  await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByLabelText("Setup key");
}

describe("TwoFactorSettings: turning it on", () => {
  it("starts closed and asks the server for nothing until opened", () => {
    render(<TwoFactorSettings />);
    expect(screen.getByRole("button", { name: /Two-step sign-in…/ })).toBeInTheDocument();
    expect(status).not.toHaveBeenCalled();
  });

  it("explains it in plain words and offers to turn it on when it is off", async () => {
    status.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    render(<TwoFactorSettings />);
    await open();
    expect(await screen.findByText(/authenticator app/)).toBeInTheDocument();
    expect(screen.getByText(/Someone who learns your password still can't get in/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on two-step sign-in" })).toBeInTheDocument();
  });

  it("asks for the password first, sends it, and shows the picture and the key in groups", async () => {
    await throughSetup();
    expect(setup).toHaveBeenCalledWith("my-password-1");
    expect(qr).toHaveBeenCalledWith(`otpauth://totp/x?secret=${SECRET}`);
    expect(screen.getByAltText("QR code to scan with your authenticator app")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(screen.getByLabelText("Setup key")).toHaveTextContent("ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567");
  });

  it("still shows the key when the picture can't be made", async () => {
    qr.mockRejectedValue(new Error("no canvas"));
    status.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    setup.mockResolvedValue({ secret: SECRET, otpauthUrl: "otpauth://x" });
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on two-step sign-in" }));
    await userEvent.type(screen.getByLabelText("Your password"), "pw-pw-pw-1");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Setup key")).toBeInTheDocument();
    expect(screen.queryByAltText(/QR code/)).not.toBeInTheDocument();
  });

  it("says when the password is wrong, and stays on the password step", async () => {
    status.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    setup.mockRejectedValue(new ApiError(403, "That password isn't right"));
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on two-step sign-in" }));
    await userEvent.type(screen.getByLabelText("Your password"), "nope-nope");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That password isn't right");
    expect(screen.getByLabelText("Your password")).toBeInTheDocument();
  });

  it("keeps Continue off until a password is typed", async () => {
    status.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on two-step sign-in" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("shows a wrong app code as a message and lets them try again", async () => {
    await throughSetup();
    enable.mockRejectedValueOnce(new ApiError(400, "That code didn't match. Check the code in your app and try again."));
    await userEvent.type(screen.getByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't match");
    expect(screen.getByLabelText("6-digit code")).toBeInTheDocument();
  });

  it("turns on with the right code and then shows the eight recovery codes, which can't be left without saying they're saved", async () => {
    await throughSetup();
    enable.mockResolvedValue({ recoveryCodes: CODES });
    await userEvent.type(screen.getByLabelText("6-digit code"), "123 456");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(enable).toHaveBeenCalledWith("123 456");

    const list = await screen.findByRole("list", { name: "Recovery codes" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(CODES);
    expect(screen.getByText(/They won't be shown again/)).toBeInTheDocument();
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/I've saved these codes/));
    expect(done).toBeEnabled();
    await userEvent.click(done);
    expect(await screen.findByText("You have 8 recovery codes left.")).toBeInTheDocument();
    expect(screen.queryByText(CODES[0])).not.toBeInTheDocument(); // gone from the page for good
  });

  it("copies the codes, one to a line", async () => {
    await throughSetup();
    enable.mockResolvedValue({ recoveryCodes: CODES });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await userEvent.type(screen.getByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy codes" }));
    expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
    expect(await screen.findByRole("button", { name: "Copied ✓" })).toBeInTheDocument();
  });

  it("says so when copying isn't possible, and points to the other ways to keep them", async () => {
    await throughSetup();
    enable.mockResolvedValue({ recoveryCodes: CODES });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) }, configurable: true });
    await userEvent.type(screen.getByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy codes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/write them down or use Download/);
  });

  it("downloads the codes as a text file", async () => {
    await throughSetup();
    enable.mockResolvedValue({ recoveryCodes: CODES });
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob;
      return "blob:codes";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await userEvent.type(screen.getByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await userEvent.click(await screen.findByRole("button", { name: "Download" }));
    expect(click).toHaveBeenCalled();
    expect(await blob!.text()).toContain(CODES.join("\n"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:codes");
    click.mockRestore();
  });

  it("can be cancelled at each step without changing anything", async () => {
    await throughSetup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Turn on two-step sign-in" })).toBeInTheDocument();
    expect(enable).not.toHaveBeenCalled();
  });
});

describe("TwoFactorSettings: when it is on", () => {
  it("says how many recovery codes are left, and warns when few are", async () => {
    status.mockResolvedValue({ enabled: true, recoveryCodesLeft: 5 });
    const { unmount } = render(<TwoFactorSettings />);
    await open();
    expect(await screen.findByText("Two-step sign-in is on.")).toBeInTheDocument();
    expect(screen.getByText("You have 5 recovery codes left.")).toBeInTheDocument();
    expect(screen.queryByText(/before you run out/)).not.toBeInTheDocument();
    unmount();

    status.mockResolvedValue({ enabled: true, recoveryCodesLeft: 1 });
    render(<TwoFactorSettings />);
    await open();
    expect(await screen.findByText(/You have 1 recovery code left\. Get new ones before you run out/)).toBeInTheDocument();
  });

  it("says when there are none left", async () => {
    status.mockResolvedValue({ enabled: true, recoveryCodesLeft: 0 });
    render(<TwoFactorSettings />);
    await open();
    expect(await screen.findByText(/You have no recovery codes left/)).toBeInTheDocument();
  });

  it("turns it off with the password and a code, and goes back to offering to turn it on", async () => {
    status.mockResolvedValue({ enabled: true, recoveryCodesLeft: 8 });
    disable.mockResolvedValue(undefined);
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    const submit = screen.getByRole("button", { name: "Turn off" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.type(screen.getByLabelText("Code from your app"), "654321");
    await userEvent.click(submit);
    expect(disable).toHaveBeenCalledWith("my-password-1", "654321");
    expect(await screen.findByRole("button", { name: "Turn on two-step sign-in" })).toBeInTheDocument();
  });

  it("shows a refusal when turning it off, and stays where it is with the password cleared of nothing it shouldn't", async () => {
    status.mockResolvedValue({ enabled: true, recoveryCodesLeft: 8 });
    disable.mockRejectedValue(new ApiError(401, "That code didn't work. Check the code in your app, or use a recovery code."));
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.type(screen.getByLabelText("Code from your app"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work");
    expect(screen.getByLabelText("Code from your app")).toHaveValue("000000");
  });

  it("gets new recovery codes with the password and a code, and shows them once", async () => {
    status.mockResolvedValue({ enabled: true, recoveryCodesLeft: 1 });
    newCodes.mockResolvedValue({ recoveryCodes: CODES });
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Get new recovery codes" }));
    expect(screen.getByText(/The old codes will stop working/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.type(screen.getByLabelText("Code from your app"), "abcde-fghjk");
    await userEvent.click(screen.getByRole("button", { name: "Get new codes" }));
    expect(newCodes).toHaveBeenCalledWith("my-password-1", "abcde-fghjk");
    expect(await screen.findByText(/Here are your new recovery codes/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Recovery codes" })).getAllByRole("listitem")).toHaveLength(8);
  });

  it("can be cancelled back to the status", async () => {
    status.mockResolvedValue({ enabled: true, recoveryCodesLeft: 8 });
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("You have 8 recovery codes left.")).toBeInTheDocument();
    expect(disable).not.toHaveBeenCalled();
  });
});

describe("TwoFactorSettings: problems", () => {
  it("says when it can't be loaded, and tries again on request", async () => {
    status.mockRejectedValueOnce(new ApiError(500, "Internal server error")).mockResolvedValueOnce({ enabled: false, recoveryCodesLeft: 0 });
    render(<TwoFactorSettings />);
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Turn on two-step sign-in" })).toBeInTheDocument();
  });

  it("can be closed again", async () => {
    status.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    render(<TwoFactorSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: /Two-step sign-in…/ })).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
