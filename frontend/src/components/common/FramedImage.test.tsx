import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FramedImage } from "./FramedImage";
import { clampPercent, clampZoom, formatPosition, isDefaultFraming, parsePosition } from "../../lib/framing";

function frame(props: Partial<Parameters<typeof FramedImage>[0]> = {}) {
  const { container } = render(<FramedImage src="https://cdn.example.com/p.jpg" {...props} />);
  const img = container.querySelector("img") as HTMLImageElement;
  return { img, box: img.parentElement as HTMLElement };
}

describe("FramedImage", () => {
  it("shows the picture whole by default: no crop shape, no zoom", () => {
    const { img, box } = frame();
    expect(box.style.aspectRatio).toBe("");
    expect(img.style.transform).toBe("");
    expect(img.className).toContain("max-h-[75vh]");
    expect(img.className).toContain("object-contain"); // a tall or wide picture is never cut off
    expect(img.src).toBe("https://cdn.example.com/p.jpg");
  });

  it("crops to the chosen shape", () => {
    expect(frame({ aspect: "1:1" }).box.style.aspectRatio).toBe("1 / 1");
    expect(frame({ aspect: "4:3" }).box.style.aspectRatio).toBe("4 / 3");
    const wide = frame({ aspect: "16:9" });
    expect(wide.box.style.aspectRatio).toBe("16 / 9");
    expect(wide.img.className).toMatch(/h-full/);
  });

  it("zooms in around the chosen point, and keeps that point in view", () => {
    const { img } = frame({ aspect: "1:1", zoom: 2.5, position: "25% 75%" });
    expect(img.style.transform).toBe("scale(2.5)");
    expect(img.style.transformOrigin).toBe("25% 75%");
    expect(img.style.objectPosition).toBe("25% 75%");
  });

  it("clips whatever zooms outside its frame", () => {
    expect(frame({ zoom: 2 }).box.className).toMatch(/overflow-hidden/);
  });

  it("renders without a source rather than crashing", () => {
    expect(() => frame({ src: undefined })).not.toThrow();
  });
});

describe("framing helpers", () => {
  it("clamps percentages and zoom", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140.4)).toBe(100);
    expect(clampPercent(33.6)).toBe(34);
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(7)).toBe(3);
    expect(clampZoom(1.2345)).toBe(1.23);
  });

  it("reads and writes positions, and falls back to the middle for junk", () => {
    expect(parsePosition("20% 80%")).toEqual([20, 80]);
    expect(parsePosition("250% 3%")).toEqual([100, 3]);
    for (const junk of ["", "20 80", "center top", "20%80%", "-5% 5%"]) expect(parsePosition(junk)).toEqual([50, 50]);
    expect(formatPosition(12.4, 140)).toBe("12% 100%");
  });

  it("knows what 'untouched' means", () => {
    expect(isDefaultFraming({ aspect: "original", zoom: 1, position: "50% 50%" })).toBe(true);
    expect(isDefaultFraming({ aspect: "1:1", zoom: 1, position: "50% 50%" })).toBe(false);
    expect(isDefaultFraming({ aspect: "original", zoom: 1.5, position: "50% 50%" })).toBe(false);
    expect(isDefaultFraming({ aspect: "original", zoom: 1, position: "10% 50%" })).toBe(false);
  });
});
