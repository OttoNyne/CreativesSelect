import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeEditor } from "./ThemeEditor";

describe("ThemeEditor", () => {
  it("passes colour changes up", () => {
    const onChange = vi.fn();
    const { container } = render(<ThemeEditor theme={{}} onChange={onChange} />);
    fireEvent.change(container.querySelectorAll('input[type="color"]')[0], { target: { value: "#ffffff" } });
    expect(onChange).toHaveBeenCalledWith({ bgColor: "#ffffff" });
  });

  it("says nothing when the text can be read", () => {
    render(<ThemeEditor theme={{ bgColor: "#ffffff", textColor: "#111111" }} onChange={() => {}} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains that a text colour too close to the background will be adjusted", () => {
    render(<ThemeEditor theme={{ bgColor: "#ffffff", textColor: "#fafafa" }} onChange={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("too close to the background");
  });

  it("checks the text against the darkened wallpaper when there is one", () => {
    // dark grey text is fine on a white background colour, but not on a picture the page darkens
    const theme = { bgColor: "#ffffff", textColor: "#333333" };
    const { rerender } = render(<ThemeEditor theme={theme} onChange={() => {}} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<ThemeEditor theme={theme} onChange={() => {}} hasWallpaper />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("ThemeEditor: styles", () => {
  it("offers ten fonts and a choice for each of the six style settings, showing the usual one when nothing is chosen", () => {
    render(<ThemeEditor theme={{}} onChange={() => {}} />);
    expect(within(screen.getByLabelText("Font")).getAllByRole("option")).toHaveLength(10);
    const usual: Record<string, string> = { Boxes: "solid", Corners: "rounded", Spacing: "comfortable", Headings: "caps", Picture: "circle", "Page width": "standard" };
    for (const [label, value] of Object.entries(usual)) expect(screen.getByLabelText(label)).toHaveValue(value);
    expect(within(screen.getByLabelText("Boxes")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Solid", "Outline", "Glass", "Flat (no box)"]);
  });

  it("passes each style choice up, leaving the rest of the theme as it was", async () => {
    const onChange = vi.fn();
    render(<ThemeEditor theme={{ bgColor: "#102030", corners: "soft" }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Boxes"), "glass");
    expect(onChange).toHaveBeenLastCalledWith({ bgColor: "#102030", corners: "soft", cardStyle: "glass" });
    await userEvent.selectOptions(screen.getByLabelText("Page width"), "wide");
    expect(onChange).toHaveBeenLastCalledWith({ bgColor: "#102030", corners: "soft", width: "wide" });
    await userEvent.selectOptions(screen.getByLabelText("Font"), "Verdana, Geneva, sans-serif");
    expect(onChange).toHaveBeenLastCalledWith({ bgColor: "#102030", corners: "soft", fontFamily: "Verdana, Geneva, sans-serif" });
  });

  it("offers ready-made looks, marks the one the theme is, and applies one without touching the colours", async () => {
    const onChange = vi.fn();
    render(<ThemeEditor theme={{ bgColor: "#102030", accentColor: "#ff00aa", cardStyle: "flat" }} onChange={onChange} />);
    const looks = screen.getByRole("group", { name: "Start from a look" });
    expect(within(looks).getAllByRole("button").map((b) => b.textContent)).toEqual(["Default", "Minimal", "Classic", "Gallery", "Journal"]);
    expect(within(looks).getByRole("button", { name: "Default" })).toHaveAttribute("aria-pressed", "false"); // flat boxes aren't the default
    await userEvent.click(within(looks).getByRole("button", { name: "Gallery" }));
    expect(onChange).toHaveBeenCalledWith({ bgColor: "#102030", accentColor: "#ff00aa", cardStyle: "glass", corners: "soft", headings: "plain", width: "wide" });
  });

  it("marks the look a theme exactly is, and says what it is", () => {
    render(<ThemeEditor theme={{ cardStyle: "glass", corners: "soft", headings: "plain", width: "wide" }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Gallery" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Glass boxes, very round/)).toBeInTheDocument();
  });

  it("stops marking any look once a choice has been changed", () => {
    render(<ThemeEditor theme={{ cardStyle: "glass", corners: "soft", headings: "plain", width: "wide", density: "roomy" }} onChange={() => {}} />);
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");
  });

  it("promises that the text stays readable whatever is chosen", () => {
    render(<ThemeEditor theme={{}} onChange={() => {}} />);
    expect(screen.getByText(/text is kept readable/)).toBeInTheDocument();
  });
});
