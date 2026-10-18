import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChainCredits, ChainStack } from "./ChainStack";
import type { ChainPart } from "../../api/chains.api";
import { API_BASE } from "../../api/base";

const artist = (name: string) => ({ id: name, username: name, displayName: name.toUpperCase(), avatarUrl: null, csVerified: false });
const parts: ChainPart[] = [
  { id: "s0", index: 0, author: artist("ann"), imageUrl: "/api/chains/c1/sections/0/image" },
  { id: "s1", index: 1, author: artist("ben"), imageUrl: "/api/chains/c1/sections/1/image" },
  { id: "s2", index: 2, author: null, imageUrl: "/api/chains/c1/sections/2/image" },
];

describe("ChainStack", () => {
  it("shows the parts in order, each described for a screen reader with who drew it", () => {
    render(<ChainStack parts={parts} />);
    const pictures = screen.getAllByRole("img");
    expect(pictures.map((p) => p.getAttribute("alt"))).toEqual(["Part 1, drawn by ANN", "Part 2, drawn by BEN", "Part 3"]);
    expect(pictures.map((p) => p.getAttribute("src"))).toEqual(parts.map((p) => `${API_BASE}${p.imageUrl}`));
  });

  it("lets each part arrive a little after the one above when it is revealed, and not otherwise", () => {
    const { rerender } = render(<ChainStack parts={parts} reveal />);
    const delays = screen.getAllByRole("img").map((p) => (p as HTMLElement).style.animationDelay);
    expect(delays).toEqual(["0ms", "450ms", "900ms"]);
    expect(screen.getAllByRole("img")[0]).toHaveClass("cs-fade-in");
    rerender(<ChainStack parts={parts} />);
    expect(screen.getAllByRole("img")[0]).not.toHaveClass("cs-fade-in");
  });
});

describe("ChainCredits", () => {
  it("names who drew the parts, linking to their profiles", () => {
    render(
      <MemoryRouter>
        <ChainCredits parts={parts} />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "ANN" })).toHaveAttribute("href", "/u/ann");
    expect(screen.getByRole("link", { name: "BEN" })).toHaveAttribute("href", "/u/ben");
    expect(screen.getByText(/Part 3/)).toBeInTheDocument();
  });
});
