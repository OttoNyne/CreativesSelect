import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
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
