import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallBanner } from "./InstallBanner";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36";

function device(userAgent: string, { standalone = false, platform = "iPhone" } = {}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true }); // (jsdom has none)
  window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as never;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("InstallBanner", () => {
  it("tells iPhone visitors how to add the site to their Home Screen", () => {
    device(IPHONE);
    render(<InstallBanner />);
    const banner = screen.getByRole("region", { name: "Install the app" });
    expect(banner).toHaveTextContent("Install CreativesSelect");
    expect(banner).toHaveTextContent("Share");
    expect(banner).toHaveTextContent("Add to Home Screen");
  });

  it("shows nothing on a computer or an Android phone", () => {
    device(DESKTOP, { platform: "Win32" });
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing once the site has been opened from the Home Screen", () => {
    device(IPHONE, { standalone: true });
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("goes away when dismissed, and stays away on the next visit", async () => {
    device(IPHONE);
    const first = render(<InstallBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Install the app" })).not.toBeInTheDocument();
    first.unmount();

    render(<InstallBanner />); // a later visit
    expect(screen.queryByRole("region", { name: "Install the app" })).not.toBeInTheDocument();
  });

  it("comes back after a month", () => {
    device(IPHONE);
    localStorage.setItem("install-banner-dismissed", String(Date.now() - 31 * 86_400_000));
    render(<InstallBanner />);
    expect(screen.getByRole("region", { name: "Install the app" })).toBeInTheDocument();
  });

  it("still dismisses for this visit when storage is blocked", async () => {
    device(IPHONE);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<InstallBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Install the app" })).not.toBeInTheDocument();
  });

  it("has a dismiss button big enough to tap", () => {
    device(IPHONE);
    render(<InstallBanner />);
    expect(screen.getByRole("button", { name: "Dismiss" }).className).toMatch(/h-10 w-10/);
  });
});
