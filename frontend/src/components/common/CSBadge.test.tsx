import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CSBadge } from "./CSBadge";

describe("CSBadge", () => {
  it("draws nothing for someone who isn't verified, so it can sit beside every name", () => {
    const { container: none } = render(<CSBadge />);
    expect(none).toBeEmptyDOMElement();
    const { container: off } = render(<CSBadge verified={false} withLabel />);
    expect(off).toBeEmptyDOMElement();
  });

  it("is an image called CSverified, with the reason on hover, and no word beside it unless asked", () => {
    const { container } = render(<CSBadge verified />);
    expect(screen.getByRole("img", { name: "CSverified" })).toBeInTheDocument();
    expect(container.querySelector("span")).toHaveAttribute("title", expect.stringContaining("1,000 active friends"));
    expect(container).not.toHaveTextContent("CSverified");
  });

  it("can show the word beside the seal, at the size it is asked", () => {
    const { container } = render(<CSBadge verified withLabel size={22} />);
    expect(container).toHaveTextContent("CSverified");
    expect(container.querySelector("svg")).toHaveAttribute("width", "22");
  });

  it("keeps each badge's gradient to itself when there are several on a page", () => {
    const { container } = render(
      <>
        <CSBadge verified />
        <CSBadge verified />
      </>
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
});
