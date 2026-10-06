import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PushSettings } from "./PushSettings";
import { pushApi, type PushPrefs } from "../../api/push.api";
import { ApiError } from "../../api/client";
import * as push from "../../lib/push";

vi.mock("../../api/push.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/push.api")>()),
  pushApi: { key: vi.fn(), status: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), setPrefs: vi.fn(), test: vi.fn() },
}));
vi.mock("../../lib/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/push")>()),
  pushSupport: vi.fn(),
  notificationPermission: vi.fn(),
  currentSubscription: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));
const api = vi.mocked(pushApi);
const lib = vi.mocked(push);

const allOn: PushPrefs = { messages: true, friends: true, comments: true, events: true, live: true, updates: true };
const fakeSub = { endpoint: "https://fcm.googleapis.com/fcm/send/mine" } as PushSubscription;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  lib.pushSupport.mockReset().mockReturnValue("supported");
  lib.notificationPermission.mockReset().mockReturnValue("default");
  lib.currentSubscription.mockReset().mockResolvedValue(null);
  lib.enablePush.mockReset();
  lib.disablePush.mockReset();
  api.key.mockResolvedValue({ enabled: true, publicKey: "KEY" });
});

describe("PushSettings: when it can't be done", () => {
  it("says plainly that the site isn't set up to send them, and offers nothing", async () => {
    api.key.mockResolvedValue({ enabled: false, publicKey: null });
    render(<PushSettings />);
    expect(await screen.findByText(/aren't available on this site yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so when the server can't be asked", async () => {
    api.key.mockRejectedValue(new ApiError(500, "boom"));
    render(<PushSettings />);
    expect(await screen.findByText(/aren't available on this site yet/)).toBeInTheDocument();
  });

  it("says a browser that can't do it can't", async () => {
    lib.pushSupport.mockReturnValue("unsupported");
    render(<PushSettings />);
    expect(await screen.findByText(/can't show notifications from a website/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tells an iPhone to add the site to the Home Screen first", async () => {
    lib.pushSupport.mockReturnValue("needs-install");
    render(<PushSettings />);
    expect(await screen.findByText(/add CreativesSelect to your Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says how to get unblocked when the person has said no in their browser", async () => {
    lib.notificationPermission.mockReturnValue("denied");
    render(<PushSettings />);
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("PushSettings: turning them on", () => {
  it("asks nothing of the person until they press the button", async () => {
    render(<PushSettings />);
    expect(await screen.findByRole("button", { name: "Turn on notifications on this device" })).toBeInTheDocument();
    expect(lib.enablePush).not.toHaveBeenCalled();
  });

  it("turns them on with the server's key, then shows the kinds, all on", async () => {
    lib.enablePush.mockResolvedValue(undefined);
    lib.currentSubscription.mockResolvedValueOnce(null).mockResolvedValue(fakeSub);
    api.status.mockResolvedValue({ enabled: true, devices: 1, thisDevice: true, prefs: allOn });
    render(<PushSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Turn on notifications on this device" }));
    expect(lib.enablePush).toHaveBeenCalledWith("KEY");
    expect(await screen.findByText("Notifications are on for this device.")).toBeInTheDocument();
    expect(api.status).toHaveBeenCalledWith(fakeSub.endpoint);
    for (const label of ["Messages", "Friends", "Comments", "Events and plans", "Lives", "Everything else"]) expect(screen.getByRole("checkbox", { name: new RegExp(label) })).toBeChecked();
  });

  it("moves to the blocked message when the person says no", async () => {
    lib.enablePush.mockRejectedValue(new push.PushError("denied", "Notifications are blocked for this site."));
    render(<PushSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Turn on notifications on this device" }));
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
  });

  it("says why, and lets them try again, when it fails", async () => {
    lib.enablePush.mockRejectedValue(new push.PushError("failed", "Your browser couldn't set up notifications."));
    render(<PushSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Turn on notifications on this device" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't set up notifications");
    expect(screen.getByRole("button", { name: "Turn on notifications on this device" })).toBeEnabled();
  });

  it("starts as 'on' for a device that is already signed up, and as 'off' for one the account has lost", async () => {
    lib.currentSubscription.mockResolvedValue(fakeSub);
    api.status.mockResolvedValue({ enabled: true, devices: 1, thisDevice: true, prefs: { ...allOn, messages: false } });
    const first = render(<PushSettings />);
    expect(await screen.findByText("Notifications are on for this device.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Messages/ })).not.toBeChecked();
    first.unmount();
    api.status.mockResolvedValue({ enabled: true, devices: 0, thisDevice: false, prefs: allOn });
    render(<PushSettings />);
    expect(await screen.findByRole("button", { name: "Turn on notifications on this device" })).toBeInTheDocument();
  });
});

describe("PushSettings: once they are on", () => {
  async function renderOn(prefs: PushPrefs = allOn) {
    lib.currentSubscription.mockResolvedValue(fakeSub);
    api.status.mockResolvedValue({ enabled: true, devices: 1, thisDevice: true, prefs });
    render(<PushSettings />);
    await screen.findByText("Notifications are on for this device.");
  }

  it("changes one kind at a time, showing the change at once and keeping what the server says", async () => {
    await renderOn();
    api.setPrefs.mockResolvedValue({ prefs: { ...allOn, live: false } });
    await userEvent.click(screen.getByRole("checkbox", { name: /Lives/ }));
    expect(api.setPrefs).toHaveBeenCalledWith({ live: false });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Lives/ })).not.toBeChecked());
    expect(screen.getByRole("checkbox", { name: /Messages/ })).toBeChecked();
  });

  it("puts a switch back, and says why, when it couldn't be saved", async () => {
    await renderOn();
    api.setPrefs.mockRejectedValue(new ApiError(500, "Internal server error"));
    await userEvent.click(screen.getByRole("checkbox", { name: /Messages/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    expect(screen.getByRole("checkbox", { name: /Messages/ })).toBeChecked();
  });

  it("sends a test and says it was sent, or that it couldn't be delivered, or why not", async () => {
    await renderOn();
    api.test.mockResolvedValueOnce({ sent: 1 }).mockResolvedValueOnce({ sent: 0 }).mockRejectedValueOnce(new ApiError(429, "That's enough tests for now — try again later"));
    await userEvent.click(screen.getByRole("button", { name: "Send me a test" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sent. It should arrive in a moment.");
    await userEvent.click(screen.getByRole("button", { name: "Send me a test" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be delivered to any device");
    await userEvent.click(screen.getByRole("button", { name: "Send me a test" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("enough tests for now"));
  });

  it("turns off for this device and offers to turn on again", async () => {
    await renderOn();
    lib.disablePush.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Turn off on this device" }));
    expect(lib.disablePush).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Turn on notifications on this device" })).toBeInTheDocument();
    expect(screen.queryByText("Notifications are on for this device.")).not.toBeInTheDocument();
  });

  it("says so, and stays on, if it couldn't be turned off", async () => {
    await renderOn();
    lib.disablePush.mockRejectedValue(new ApiError(500, "Internal server error"));
    await userEvent.click(screen.getByRole("button", { name: "Turn off on this device" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    expect(screen.getByText("Notifications are on for this device.")).toBeInTheDocument();
  });
});
