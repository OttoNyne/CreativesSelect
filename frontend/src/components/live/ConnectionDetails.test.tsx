import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionDetails } from "./ConnectionDetails";

let clipboard: { writeText: ReturnType<typeof vi.fn> };
beforeEach(() => {
  clipboard = { writeText: vi.fn(async () => {}) };
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("ConnectionDetails", () => {
  it("is folded away until asked for, unless something is wrong", () => {
    const { container, rerender } = render(<ConnectionDetails lines={["+1s  hello"]} />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    rerender(<ConnectionDetails lines={["+1s  hello"]} open />);
    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("lists what happened, in order, and says so when nothing has", () => {
    const { rerender } = render(<ConnectionDetails lines={[]} open />);
    expect(screen.getByText("Nothing to report yet.")).toBeInTheDocument();
    rerender(<ConnectionDetails lines={["+0s  Connecting", "+3s  Disconnected (reason 4)"]} open />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["+0s  Connecting", "+3s  Disconnected (reason 4)"]);
  });

  it("copies the lines with the phone's network and browser, to be sent on", async () => {
    render(<ConnectionDetails lines={["+0s  Connecting", "+3s  Disconnected (reason 4)"]} open />);
    await userEvent.click(screen.getByRole("button", { name: "Copy details" }));
    const copied = clipboard.writeText.mock.calls[0][0] as string;
    expect(copied).toMatch(/^Network: /);
    expect(copied).toContain("Browser: ");
    expect(copied).toContain("+3s  Disconnected (reason 4)");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("carries on if the browser won't let it copy", async () => {
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    render(<ConnectionDetails lines={["+0s  x"]} open />);
    await userEvent.click(screen.getByRole("button", { name: "Copy details" }));
    expect(screen.getByRole("button", { name: "Copy details" })).toBeInTheDocument();
  });
});
