import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { scanQr } from "../test/scanQr";
import { CANONICAL_SITE, liveUrl, profileUrl, qrCodeFor, siteOrigin } from "./share";

describe("which address gets shared", () => {
  it("is the real domain on the live site, however it was reached", () => {
    expect(siteOrigin({ origin: "https://www.creativesselect.com", hostname: "www.creativesselect.com" })).toBe("https://www.creativesselect.com");
    expect(siteOrigin({ origin: "https://creativesselect.com", hostname: "creativesselect.com" })).toBe("https://creativesselect.com");
  });

  it("is the real domain, not the old *.vercel.app address that no longer takes sign-ins", () => {
    expect(siteOrigin({ origin: "https://capstone-xyz.vercel.app", hostname: "capstone-xyz.vercel.app" })).toBe(CANONICAL_SITE);
  });

  it("is the page's own address on a developer's machine", () => {
    expect(siteOrigin({ origin: "http://localhost:4173", hostname: "localhost" })).toBe("http://localhost:4173");
    expect(siteOrigin({ origin: "http://127.0.0.1:5173", hostname: "127.0.0.1" })).toBe("http://127.0.0.1:5173");
  });

  it("builds profile and live links from it, safely", () => {
    expect(profileUrl("zoe_1")).toBe(`${window.location.origin}/u/zoe_1`);
    expect(profileUrl("a/b c")).toBe(`${window.location.origin}/u/a%2Fb%20c`);
    expect(liveUrl("abc123")).toBe(`${window.location.origin}/live/abc123`);
  });
});

describe("the QR code", () => {
  it("is a PNG a scanner can read, giving back exactly the address", async () => {
    for (const url of ["https://www.creativesselect.com", "https://www.creativesselect.com/u/zoe_1", "https://www.creativesselect.com/live/6ac12031d20337fa4e7150e9"]) {
      const data = await qrCodeFor(url);
      expect(data).toMatch(/^data:image\/png;base64,/);
      expect(scanQr(data), url).toBe(url);
    }
  });

  it("is black on white with a clear border, which is what cameras read most reliably", async () => {
    const png = PNG.sync.read(Buffer.from((await qrCodeFor("https://www.creativesselect.com")).split(",")[1], "base64"));
    const pixel = (x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];
    expect(pixel(0, 0)).toEqual([255, 255, 255]); // the border
    expect(png.width).toBeGreaterThanOrEqual(400);
    const colours = new Set<string>();
    for (let i = 0; i < png.data.length; i += 4) colours.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
    expect([...colours].sort()).toEqual(["0,0,0", "255,255,255"]);
  });
});
