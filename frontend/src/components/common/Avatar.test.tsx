import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("shows the picture when there is one, with the person's name as alt text", () => {
    render(<Avatar username="ada" displayName="Ada Lovelace" avatarUrl="https://cdn.example.com/ada.jpg" />);
    const img = screen.getByAltText("Ada Lovelace");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/ada.jpg");
  });

  it("falls back to their initial, upper-cased, when there's no picture", () => {
    render(<Avatar username="ada" displayName="ada lovelace" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows a question mark for a blank display name", () => {
    render(<Avatar username="x" displayName="   " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("always gives the same person the same colour, and different people usually different ones", () => {
    const colourOf = (username: string) => {
      const { container, unmount } = render(<Avatar username={username} displayName="X" />);
      const bg = (container.firstChild as HTMLElement).style.background;
      unmount();
      return bg;
    };
    expect(colourOf("ada")).toBe(colourOf("ada"));
    expect(colourOf("ada")).not.toBe(colourOf("grace"));
  });

  it("respects the requested size", () => {
    const { container } = render(<Avatar username="ada" displayName="Ada" size={64} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("64px");
    expect(el.style.height).toBe("64px");
  });
});
