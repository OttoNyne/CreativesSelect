import { describe, expect, it } from "vitest";
import { readableTheme, profileThemeStyle } from "./applyProfileTheme";
import {
  BRIGHTEST_WALLPAPER,
  MIN_CONTRAST,
  composite,
  contrastRatio,
  isLightColor,
  mutedOn,
  panelColor,
  panelFor,
  parseColor,
  readableOn,
  textOn,
  toHex,
  type Rgb,
} from "./contrast";

const rgb = (hex: string) => parseColor(hex) as Rgb;
const ratio = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

describe("colour maths", () => {
  it("reads 3- and 6-digit hex and rejects anything else", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("#12121A")).toEqual([18, 18, 26]);
    for (const bad of ["red", "#12", "#gggggg", "rgb(0,0,0)", "", undefined, null, "url(x)"]) expect(parseColor(bad as string)).toBeNull();
  });

  it("matches the published WCAG ratios", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(ratio("#ffffff", "#ffffff")).toBe(1);
  });

  it("round-trips through hex", () => {
    expect(toHex(rgb("#8b5cf6"))).toBe("#8b5cf6");
  });
});

describe("readableOn", () => {
  it("leaves a readable colour alone", () => {
    expect(toHex(readableOn(rgb("#f5f5f7"), rgb("#12121a")))).toBe("#f5f5f7");
  });

  it("moves an unreadable colour only as far as needed, keeping its hue", () => {
    const fixed = readableOn(rgb("#3b3b8f"), rgb("#12121a")); // dark blue on near-black
    expect(contrastRatio(fixed, rgb("#12121a"))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(fixed[2]).toBeGreaterThan(fixed[0]); // still bluish
  });

  it("ends at white or black at worst, and one of those always reads (4.58:1 at the very least)", () => {
    for (const bg of ["#000000", "#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff", "#ffd60a"]) {
      for (const text of ["#000000", "#ffffff", "#808080", "#ffd60a"]) {
        expect(contrastRatio(readableOn(rgb(text), rgb(bg)), rgb(bg)), `${text} on ${bg}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });
});

describe("textOn", () => {
  it("picks white on dark fills and near-black on light ones", () => {
    expect(textOn(rgb("#12121a"))).toBe("#ffffff");
    expect(textOn(rgb("#ffe14d"))).toBe("#111118");
  });
});

describe("which backgrounds need a panel", () => {
  it("needs none at the ends of the range", () => {
    for (const bg of ["#000000", "#12121a", "#1a1a1a", "#ffffff", "#f4efe3", "#fdf6e3"]) expect(panelFor(rgb(bg)), bg).toBeNull();
  });

  it("gives mid-tones a panel, dark or light by how bright they are", () => {
    expect(panelFor(rgb("#808080"))).toBe("dark");
    expect(panelFor(rgb("#0047ab"))).toBe("dark");
    expect(panelFor(rgb("#ffd60a"))).toBe("light");
    expect(panelFor(rgb("#c0c0c0"))).toBe("light");
  });

  it("makes sure the panel's own text reads, at full strength and faded", () => {
    for (const bg of ["#808080", "#0047ab", "#ffd60a", "#c0c0c0", "#ff0000", "#00aa00", "#7a7a30"]) {
      const theme = readableTheme({ bgColor: bg, textColor: bg });
      const backdrop = panelColor(theme.panel ?? "dark", rgb(bg));
      expect(contrastRatio(rgb(theme.text), backdrop), bg).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrastRatio(rgb(theme.muted), backdrop), bg).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe("muted text", () => {
  it("is softer than the text but still readable", () => {
    const muted = mutedOn(rgb("#f5f5f7"), rgb("#12121a"));
    expect(toHex(muted)).not.toBe("#f5f5f7");
    expect(contrastRatio(muted, rgb("#12121a"))).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("falls back to the full text colour when softening would make it unreadable", () => {
    expect(toHex(mutedOn(rgb("#8a8a8a"), rgb("#000000")))).toBe("#8a8a8a");
  });
});

describe("readableTheme", () => {
  it("keeps the default dark theme as it was", () => {
    const t = readableTheme({});
    expect(t).toMatchObject({ scheme: "dark", panel: null, background: "#12121a", text: "#f5f5f7", accent: "#8b5cf6" });
  });

  it("switches to the light scheme on a light background and flips light text to dark", () => {
    const t = readableTheme({ bgColor: "#f4efe3", textColor: "#fafafa" });
    expect(t.scheme).toBe("light");
    expect(ratio(t.text, "#f4efe3")).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("flips dark text to light on a dark background", () => {
    const t = readableTheme({ bgColor: "#000000", textColor: "#222222" });
    expect(t.scheme).toBe("dark");
    expect(ratio(t.text, "#000000")).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("keeps the owner's colour when it already reads", () => {
    expect(readableTheme({ bgColor: "#ffffff", textColor: "#222244" }).text).toBe("#222244");
  });

  it("always gives the accent as text and the accent as a button fill readable colours", () => {
    for (const bg of ["#12121a", "#ffffff", "#ffd60a", "#808080"]) {
      for (const accent of ["#8b5cf6", "#ffe14d", "#111111", "#ff0000", "#00ffff", "#808080"]) {
        const t = readableTheme({ bgColor: bg, accentColor: accent });
        const backdrop = t.panel ? panelColor(t.panel, rgb(bg)) : rgb(bg);
        expect(contrastRatio(rgb(t.accentText), backdrop), `link ${accent} on ${bg}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
        expect(ratio(t.onAccent, t.accentFill), `label on button ${accent}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  it("ignores colours it can't parse instead of passing them into the page", () => {
    const style = profileThemeStyle({ bgColor: "red; background:url(x)", textColor: "nonsense", accentColor: "" }) as Record<string, string>;
    expect(style["--profile-bg"]).toBe("#12121a");
    expect(style["--profile-text"]).toBe("#f5f5f7");
    expect(style["--profile-accent"]).toBe("#8b5cf6");
  });

  describe("with a wallpaper", () => {
    it("always uses the dark scheme, whatever the background colour", () => {
      expect(readableTheme({ bgColor: "#ffffff" }, true)).toMatchObject({ scheme: "dark", panel: null });
    });

    it("keeps text readable on the brightest photo under the scrim", () => {
      const worst = toHex(BRIGHTEST_WALLPAPER);
      for (const text of ["#f5f5f7", "#ffffff", "#222222", "#888888", "#ff0000", "#808080"]) {
        const t = readableTheme({ textColor: text }, true);
        expect(ratio(t.text, worst), text).toBeGreaterThanOrEqual(MIN_CONTRAST);
        expect(ratio(t.muted, worst), `muted ${text}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    });

    it("lays the scrim over the picture", () => {
      const style = profileThemeStyle({}, "https://x/y.jpg", "50% 50%");
      expect(style.backgroundImage).toContain("rgba(0,0,0,0.55)");
      expect(style.backgroundImage).toContain('url("https://x/y.jpg")');
    });
  });
});

describe("isLightColor / composite", () => {
  it("splits at the point where black and white text read equally", () => {
    expect(isLightColor(rgb("#ffffff"))).toBe(true);
    expect(isLightColor(rgb("#12121a"))).toBe(false);
    expect(isLightColor(rgb("#777777"))).toBe(true);
    expect(isLightColor(rgb("#707070"))).toBe(false);
  });

  it("blends a translucent colour over another", () => {
    expect(toHex(composite([255, 255, 255], 0.5, [0, 0, 0]))).toBe("#808080");
  });
});
