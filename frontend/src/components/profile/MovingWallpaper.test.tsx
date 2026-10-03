import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MovingWallpaper } from "./MovingWallpaper";
import { WALLPAPER_SCRIM } from "../../theme/contrast";

describe("MovingWallpaper", () => {
  it("draws the picture on a layer that carries the motion's animation class", () => {
    render(<MovingWallpaper url="https://x/w.jpg" position="30% 70%" motion="drift" />);
    const layer = screen.getByTestId("moving-wallpaper");
    expect(layer).toHaveAttribute("data-motion", "drift");
    const picture = layer.querySelector(".wallpaper-motion") as HTMLElement;
    expect(picture).toHaveClass("wallpaper-motion-drift");
    expect(picture.style.backgroundImage).toBe('url("https://x/w.jpg")');
    expect(picture.style.backgroundPosition).toBe("30% 70%");
  });

  it("has the same dark scrim as a still wallpaper, so the text on top stays readable", () => {
    render(<MovingWallpaper url="https://x/w.jpg" position="50% 50%" motion="zoom" />);
    const scrim = screen.getByTestId("moving-wallpaper").lastElementChild as HTMLElement;
    expect(scrim.style.background).toContain(`rgba(0, 0, 0, ${WALLPAPER_SCRIM})`);
  });

  it("is decoration: hidden from screen readers, behind the page, and clipped to its box", () => {
    render(<MovingWallpaper url="https://x/w.jpg" position="50% 50%" motion="pan" />);
    const layer = screen.getByTestId("moving-wallpaper");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveClass("fixed", "inset-0", "-z-10", "overflow-hidden");
  });

  it("can be placed in a box instead (for a preview)", () => {
    render(<MovingWallpaper url="https://x/w.jpg" position="50% 50%" motion="pulse" className="absolute inset-0" />);
    expect(screen.getByTestId("moving-wallpaper")).toHaveClass("absolute");
    expect(screen.getByTestId("moving-wallpaper")).not.toHaveClass("fixed");
  });
});
