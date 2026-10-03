import { afterEach, describe, expect, it, vi } from "vitest";
import { isWallpaperMotion, motionOf, WALLPAPER_MOTIONS } from "./wallpaperMotion";
import { shrinkForUpload } from "./resizeImage";

describe("wallpaper motions", () => {
  it("are the five the server knows, each with a label and a hint", () => {
    expect(WALLPAPER_MOTIONS.map((m) => m.value)).toEqual(["none", "zoom", "drift", "pan", "pulse"]);
    for (const m of WALLPAPER_MOTIONS) {
      expect(m.label).toBeTruthy();
      expect(m.hint).toBeTruthy();
    }
  });

  it("are recognised, and anything else is treated as still", () => {
    expect(isWallpaperMotion("drift")).toBe(true);
    for (const bad of ["spin", "", undefined, null, 3, "ZOOM"]) {
      expect(isWallpaperMotion(bad)).toBe(false);
      expect(motionOf(bad)).toBe("none");
    }
    expect(motionOf("pulse")).toBe("pulse");
  });
});

describe("shrinkForUpload", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubCanvas(draw: ReturnType<typeof vi.fn>, blob: Blob | null = new Blob(["jpeg"], { type: "image/jpeg" })) {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: draw }), toBlob: (cb: (b: Blob | null) => void) => cb(blob) };
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => (tag === "canvas" ? canvas : document.createElementNS("http://www.w3.org/1999/xhtml", tag))) as never);
    return canvas;
  }

  it("scales a large photo down to the longest side, keeping its shape, as a JPEG", async () => {
    const draw = vi.fn();
    const canvas = stubCanvas(draw);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    const out = await shrinkForUpload(new File(["x"], "big.heic"));
    expect([canvas.width, canvas.height]).toEqual([1024, 768]);
    expect(out.type).toBe("image/jpeg");
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 768);
  });

  it("doesn't enlarge a small photo", async () => {
    const canvas = stubCanvas(vi.fn());
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 300, height: 200, close: vi.fn() })));
    await shrinkForUpload(new File(["x"], "small.png"));
    expect([canvas.width, canvas.height]).toEqual([300, 200]);
  });

  it("sends the original if the browser can't read it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("can't decode"))));
    const original = new File(["x"], "odd.avif");
    expect(await shrinkForUpload(original)).toBe(original);
  });

  it("sends the original if the browser can't make a JPEG of it", async () => {
    stubCanvas(vi.fn(), null);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })));
    const original = new File(["x"], "p.png");
    expect(await shrinkForUpload(original)).toBe(original);
  });
});
