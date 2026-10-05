import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path));

describe("how the site looks when it is shared", () => {
  const html = read("index.html").toString("utf8");
  const meta = (key: string, value: string) => new RegExp(`<meta (?:property|name)="${key}" content="${value}"`).test(html);

  it("names the thumbnail by its full address, as sites that show link previews need", () => {
    expect(meta("og:image", "https://www.creativesselect.com/og-image.png")).toBe(true);
    expect(meta("twitter:image", "https://www.creativesselect.com/og-image.png")).toBe(true);
    expect(meta("twitter:card", "summary_large_image")).toBe(true);
    expect(html).toMatch(/og:image:alt/);
  });

  it("has a thumbnail that is a 1200 x 630 PNG, the size link previews use", () => {
    const png = read("public/og-image.png");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(1_000_000);
  });

  it("uses the logo for the tab icon and the home-screen icons", () => {
    expect(read("public/favicon.svg").toString("utf8")).toContain("linearGradient");
    for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]] as const) {
      const png = read(`public/${file}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
    }
  });
});
