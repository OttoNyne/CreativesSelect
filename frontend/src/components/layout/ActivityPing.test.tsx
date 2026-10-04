import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { ActivityPing, PING_INTERVAL_MS } from "./ActivityPing";
import { activityApi } from "../../api/activity.api";
import { useAuth } from "../../context/AuthContext";

vi.mock("../../api/activity.api", () => ({ activityApi: { ping: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const ping = vi.mocked(activityApi.ping);

const signedInAs = (user: object | null) => vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, setUser: vi.fn(), refresh: async () => {} } as never);
const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
};

beforeEach(() => {
  ping.mockReset();
  ping.mockResolvedValue(undefined);
  setVisibility("visible");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("ActivityPing", () => {
  it("renders nothing", () => {
    signedInAs({ id: "me" });
    const { container } = render(<ActivityPing />);
    expect(container).toBeEmptyDOMElement();
  });

  it("checks in straight away and then every two minutes", async () => {
    signedInAs({ id: "me" });
    render(<ActivityPing />);
    expect(ping).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    });
    expect(ping).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 2);
    });
    expect(ping).toHaveBeenCalledTimes(4);
  });

  it("does nothing for someone who isn't signed in", async () => {
    signedInAs(null);
    render(<ActivityPing />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 2);
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it("does nothing for someone who has turned it off", async () => {
    signedInAs({ id: "me", showActivity: false });
    render(<ActivityPing />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 2);
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it("doesn't check in from a hidden tab, and does as soon as it is shown again", async () => {
    signedInAs({ id: "me" });
    setVisibility("hidden");
    render(<ActivityPing />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 2);
    });
    expect(ping).not.toHaveBeenCalled();
    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("carries on quietly when a check-in fails", async () => {
    signedInAs({ id: "me" });
    ping.mockRejectedValue(new Error("offline"));
    render(<ActivityPing />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    });
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("stops when it is removed", async () => {
    signedInAs({ id: "me" });
    const { unmount } = render(<ActivityPing />);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 2);
    });
    expect(ping).toHaveBeenCalledTimes(1);
  });
});
