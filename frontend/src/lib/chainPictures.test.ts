import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { edgePicture, joinParts, partPicture } from "./chainPictures";

type Drawn = unknown[];
let drawn: Drawn[] = [];
const sizes: { width: number; height: number }[] = [];

beforeEach(() => {
  drawn = [];
  sizes.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    sizes.push({ width: this.width, height: this.height });
    return { drawImage: (...args: unknown[]) => drawn.push(args) } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("chain pictures", () => {
  it("turns a drawing into a PNG", async () => {
    const blob = await partPicture(document.createElement("canvas"));
    expect(blob?.type).toBe("image/png");
  });

  it("cuts the strip along the bottom of a part: 40 pixels of its 400, all the way across", async () => {
    const part = document.createElement("canvas");
    await edgePicture(part);
    expect(sizes[0]).toEqual({ width: 1200, height: 40 });
    expect(drawn[0]).toEqual([part, 0, 360, 1200, 40, 0, 0, 1200, 40]);
  });

  it("joins the parts of a finished chain into one tall picture, in order", async () => {
    const loaded: string[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        loaded.push(url);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const blob = await joinParts(["/a.png", "/b.png", "/c.png"]);
    expect(blob?.type).toBe("image/png");
    expect(loaded).toEqual(["/a.png", "/b.png", "/c.png"]);
    expect(sizes[0]).toEqual({ width: 1200, height: 1200 });
    expect(drawn.map((d) => d.slice(1))).toEqual([[0, 0, 1200, 400], [0, 400, 1200, 400], [0, 800, 1200, 400]]);
  });

  it("gives up when a picture can't be loaded", async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", BrokenImage);
    await expect(joinParts(["/a.png"])).rejects.toThrow();
  });
});
