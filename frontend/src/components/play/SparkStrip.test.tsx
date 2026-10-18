import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SparkStrip } from "./SparkStrip";
import { decodeSpark, sparkOfDay, sparkText } from "../../lib/sparks";

describe("SparkStrip", () => {
  it("shows today's spark and leads to the sketchpad with it, or with nothing chosen", () => {
    render(
      <MemoryRouter>
        <SparkStrip />
      </MemoryRouter>
    );
    expect(screen.getByText(sparkText(sparkOfDay()))).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Sketch this" });
    expect(decodeSpark(new URL(link.getAttribute("href")!, "https://x.test").searchParams.get("spark"))).toEqual(sparkOfDay());
    expect(screen.getByRole("link", { name: "Open the sketchpad" })).toHaveAttribute("href", "/sketch");
  });
});
