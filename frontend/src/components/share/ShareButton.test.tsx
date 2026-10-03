import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareButton } from "./ShareButton";
import { scanQr } from "../../test/scanQr";

const URL_TO_SHARE = "https://www.creativesselect.com/u/zoe_1";

function setup(props: Partial<React.ComponentProps<typeof ShareButton>> = {}) {
  render(
    <div data-scheme="light">
      <ShareButton url={URL_TO_SHARE} title="Share Zoe's profile" description="Scan to open it." {...props}>
        Share
      </ShareButton>
    </div>
  );
}
const open = () => userEvent.click(screen.getByRole("button", { name: "Share" }));

let clipboard: { writeText: ReturnType<typeof vi.fn> };
beforeEach(() => {
  clipboard = { writeText: vi.fn(async () => {}) };
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("ShareButton and its window", () => {
  it("opens a window with a QR code that scans to the link, and the link itself", async () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await open();
    const dialog = screen.getByRole("dialog", { name: "Share Zoe's profile" });
    expect(within(dialog).getByText("Scan to open it.")).toBeInTheDocument();
    const qr = await within(dialog).findByTestId("share-qr");
    expect(qr).toHaveAccessibleName(`QR code that opens ${URL_TO_SHARE}`);
    expect(scanQr(qr.getAttribute("src")!)).toBe(URL_TO_SHARE);
    expect(within(dialog).getByLabelText("Link")).toHaveValue(URL_TO_SHARE);
  });

  it("is drawn outside the page's themed area, so a profile's colours can't hide it", async () => {
    setup();
    await open();
    expect(screen.getByRole("dialog").closest("[data-scheme]")).toBeNull();
  });

  it("copies the link and says so", async () => {
    setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(clipboard.writeText).toHaveBeenCalledWith(URL_TO_SHARE);
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
  });

  it("says what to do if the browser won't let it copy", async () => {
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/Couldn't copy automatically/)).toBeInTheDocument();
  });

  it("offers the device's share sheet only where there is one", async () => {
    setup();
    await open();
    expect(screen.queryByRole("button", { name: "Share…" })).not.toBeInTheDocument();
  });

  it("uses the device's share sheet when there is one, and doesn't mind it being dismissed", async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException("closed", "AbortError")).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Share…" }));
    await userEvent.click(screen.getByRole("button", { name: "Share…" }));
    expect(share).toHaveBeenCalledWith({ title: "Share Zoe's profile", url: URL_TO_SHARE });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lets the QR code be saved as a picture", async () => {
    setup();
    await open();
    const save = await screen.findByRole("link", { name: "Save QR code" });
    expect(save).toHaveAttribute("download", "creativesselect-qr.png");
    expect(save.getAttribute("href")).toMatch(/^data:image\/png;base64,/);
  });

  it("closes with the ✕, the Escape key or a click outside, and puts focus back on the button", async () => {
    setup();
    for (const close of [() => userEvent.click(screen.getByRole("button", { name: "Close" })), () => userEvent.keyboard("{Escape}"), () => userEvent.click(screen.getByRole("dialog").parentElement!)]) {
      await open();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
      await close();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Share" })).toHaveFocus();
    }
  });

  it("stays open, with focus where it was, when the page behind it re-renders", async () => {
    const { rerender } = render(
      <ShareButton url={URL_TO_SHARE} title="t">
        Share
      </ShareButton>
    );
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(screen.getByRole("button", { name: "Copy link" })).toHaveFocus();
    rerender(
      <ShareButton url={URL_TO_SHARE} title="t">
        Share
      </ShareButton>
    );
    expect(screen.getByRole("button", { name: "Copy link" })).toHaveFocus();
  });

  it("works the address out when it is opened, if given a function", async () => {
    const url = vi.fn(() => "https://www.creativesselect.com/live/abc");
    setup({ url });
    expect(url).not.toHaveBeenCalled();
    await open();
    expect(url).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Link")).toHaveValue("https://www.creativesselect.com/live/abc");
  });
});
