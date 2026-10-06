import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignedInDevices } from "./SignedInDevices";
import { authApi, type SignedInDevice } from "../../api/auth.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/auth.api", () => ({ authApi: { sessions: vi.fn(), endSession: vi.fn(), endOtherSessions: vi.fn() } }));
const sessions = vi.mocked(authApi.sessions);
const endSession = vi.mocked(authApi.endSession);
const endOtherSessions = vi.mocked(authApi.endOtherSessions);

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const here: SignedInDevice = { id: "a1", device: "Chrome on Windows", current: true, createdAt: ago(3_600_000), lastSeenAt: ago(0) };
const phone: SignedInDevice = { id: "b2", device: "Safari on iPhone", current: false, createdAt: ago(2 * 86_400_000), lastSeenAt: ago(5 * 3_600_000) };
const laptop: SignedInDevice = { id: "c3", device: "Firefox on Linux", current: false, createdAt: ago(86_400_000), lastSeenAt: ago(30 * 60_000) };

beforeEach(() => {
  sessions.mockReset();
  endSession.mockReset();
  endOtherSessions.mockReset();
});

async function open() {
  await userEvent.click(screen.getByRole("button", { name: /Where you.re signed in/ }));
}

describe("SignedInDevices", () => {
  it("starts closed and asks the server for nothing until it is opened", () => {
    render(<SignedInDevices />);
    expect(screen.getByRole("button", { name: /Where you.re signed in/ })).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(sessions).not.toHaveBeenCalled();
  });

  it("lists each device in plain words, marks this one, and says when the others were last used", async () => {
    sessions.mockResolvedValue({ sessions: [here, laptop, phone] });
    render(<SignedInDevices />);
    await open();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Chrome on Windows")).toBeInTheDocument();
    expect(within(items[0]).getByText("This device")).toBeInTheDocument();
    expect(within(items[0]).getByText(/Using it now/)).toBeInTheDocument();
    expect(within(items[0]).queryByRole("button")).not.toBeInTheDocument(); // this one is ended with Log out
    expect(within(items[1]).getByText(/Last used 30 minutes ago/)).toBeInTheDocument();
    expect(within(items[2]).getByText(/Last used 5 hours ago/)).toBeInTheDocument();
    expect(within(items[2]).getByText(/signed in 2 days ago/)).toBeInTheDocument();
  });

  it("signs one device out, and takes it off the list", async () => {
    sessions.mockResolvedValue({ sessions: [here, laptop, phone] });
    endSession.mockResolvedValue(undefined);
    render(<SignedInDevices />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: /Sign out Safari on iPhone/ }));
    expect(endSession).toHaveBeenCalledWith("b2");
    expect(await screen.findByText("Safari on iPhone was signed out.")).toBeInTheDocument();
    expect(screen.queryByText("Safari on iPhone")).not.toBeInTheDocument();
    expect(screen.getByText("Firefox on Linux")).toBeInTheDocument();
    expect(screen.getByText("Chrome on Windows")).toBeInTheDocument();
  });

  it("signs every other device out in one go, keeping this one", async () => {
    sessions.mockResolvedValue({ sessions: [here, laptop, phone] });
    endOtherSessions.mockResolvedValue({ ended: 2 });
    render(<SignedInDevices />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out all 2 other devices" }));
    expect(await screen.findByText("Signed out 2 other devices.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByText(/this device only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign out/ })).not.toBeInTheDocument();
  });

  it("words the button for one other device, and offers none when there are no others", async () => {
    sessions.mockResolvedValue({ sessions: [here, phone] });
    const { unmount } = render(<SignedInDevices />);
    await open();
    expect(await screen.findByRole("button", { name: "Sign out the other device" })).toBeInTheDocument();
    unmount();

    sessions.mockResolvedValue({ sessions: [here] });
    render(<SignedInDevices />);
    await open();
    expect(await screen.findByText(/this device only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /other device/ })).not.toBeInTheDocument();
  });

  it("shows a problem with signing out, and keeps the device on the list", async () => {
    sessions.mockResolvedValue({ sessions: [here, phone] });
    endSession.mockRejectedValue(new ApiError(429, "You've ended a lot of sign-ins — please wait a little and try again."));
    render(<SignedInDevices />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: /Sign out Safari on iPhone/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've ended a lot of sign-ins");
    expect(screen.getByText("Safari on iPhone")).toBeInTheDocument();
  });

  it("refreshes the list when the device it was asked to sign out had already gone", async () => {
    sessions.mockResolvedValueOnce({ sessions: [here, phone] }).mockResolvedValueOnce({ sessions: [here] });
    endSession.mockRejectedValue(new ApiError(404, "That sign-in wasn't found"));
    render(<SignedInDevices />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: /Sign out Safari on iPhone/ }));
    expect(await screen.findByText(/this device only/)).toBeInTheDocument();
    expect(screen.queryByText("Safari on iPhone")).not.toBeInTheDocument();
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it("says when the list can't be loaded, and tries again on request", async () => {
    sessions.mockRejectedValueOnce(new ApiError(500, "Internal server error")).mockResolvedValueOnce({ sessions: [here] });
    render(<SignedInDevices />);
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Chrome on Windows")).toBeInTheDocument();
  });

  it("can be closed again, and looks the list up afresh when reopened", async () => {
    sessions.mockResolvedValue({ sessions: [here] });
    render(<SignedInDevices />);
    await open();
    await screen.findByText("Chrome on Windows");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Chrome on Windows")).not.toBeInTheDocument();
    await open();
    await screen.findByText("Chrome on Windows");
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it("only allows one sign-out at a time", async () => {
    sessions.mockResolvedValue({ sessions: [here, laptop, phone] });
    endSession.mockImplementation(() => new Promise(() => {}));
    render(<SignedInDevices />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: /Sign out Safari on iPhone/ }));
    expect(screen.getByRole("button", { name: /Sign out Firefox on Linux/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sign out all 2 other devices/ })).toBeDisabled();
    expect(screen.getByText("Signing out…", { selector: "button" })).toBeInTheDocument();
  });
});
