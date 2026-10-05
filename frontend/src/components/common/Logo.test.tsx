import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo, LogoMark } from "./Logo";

describe("Logo", () => {
  it("shows the name next to the mark, and hides the mark from screen readers", () => {
    const { container } = render(<Logo />);
    expect(container).toHaveTextContent("CreativesSelect");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("can show the tagline, and is the size it is asked to be", () => {
    const { container } = render(<Logo height={40} tagline />);
    expect(container).toHaveTextContent("Ideas · Brands · Digital growth");
    expect(container.querySelector("svg")).toHaveAttribute("height", "40");
  });

  it("a mark on its own can be given a name, and then is an image", () => {
    render(<LogoMark title="CreativesSelect logo" />);
    expect(screen.getByRole("img", { name: "CreativesSelect logo" })).toBeInTheDocument();
  });

  it("gives every mark its own gradient names, so two on a page don't borrow each other's", () => {
    const { container } = render(
      <>
        <LogoMark />
        <LogoMark />
      </>
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    for (const path of container.querySelectorAll("path[fill^='url(']")) {
      const id = /url\(#([^)]+)\)/.exec(path.getAttribute("fill")!)![1];
      expect(ids).toContain(id);
    }
  });
});
