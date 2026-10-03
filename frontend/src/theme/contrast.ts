// Colour maths for keeping text readable on whatever background a profile owner picks (WCAG 2.x contrast ratios).

export type Rgb = [number, number, number];

/** The smallest contrast ratio WCAG AA allows for normal-sized text. */
export const MIN_CONTRAST = 4.5;

export function parseColor(value: string | undefined | null): Rgb | null {
  if (!value) return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

export function toHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The point where black and white text read equally well; a background brighter than this wants dark text. */
export const LIGHT_BACKGROUND_LUMINANCE = 0.179;

export const isLightColor = (rgb: Rgb) => luminance(rgb) > LIGHT_BACKGROUND_LUMINANCE;

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/**
 * `color` itself when it is already readable on `backdrop`; otherwise the nearest shade of it (same hue) that is,
 * found by moving toward white or black — whichever stands out more against the backdrop.
 */
export function readableOn(color: Rgb, backdrop: Rgb, min = MIN_CONTRAST): Rgb {
  if (contrastRatio(color, backdrop) >= min) return color;
  const toward = contrastRatio(WHITE, backdrop) >= contrastRatio(BLACK, backdrop) ? WHITE : BLACK;
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, toward, step / 20);
    if (contrastRatio(candidate, backdrop) >= min) return candidate;
  }
  return toward;
}

/** Whichever of white or near-black reads better on top of `fill` (the text colour for a button painted `fill`). */
export function textOn(fill: Rgb): string {
  return contrastRatio(WHITE, fill) >= contrastRatio([17, 17, 24], fill) ? "#ffffff" : "#111118";
}

/** How much of the page's black scrim covers a wallpaper. At this strength white text clears 4.5:1 even on an all-white photo. */
export const WALLPAPER_SCRIM = 0.55;

/** The brightest a wallpaper can look once the scrim is on it — the worst case text has to be readable against. */
export const BRIGHTEST_WALLPAPER: Rgb = mix(WHITE, BLACK, WALLPAPER_SCRIM);

const INK: Rgb = [17, 17, 24];
const PANEL_OPACITY = 0.9;

/** The lightest the page's faded text (white or ink at 60%) can be while still readable on this background. */
const FADED = 0.6;

/** The colour you see where `over` (at `opacity`) is laid on `under`. */
export const composite = (over: Rgb, opacity: number, under: Rgb): Rgb => mix(under, over, opacity);

const fadedTextReadable = (text: Rgb, backdrop: Rgb) => contrastRatio(composite(text, FADED, backdrop), backdrop) >= MIN_CONTRAST;

export type Panel = "dark" | "light";

/**
 * A background in the middle of the range (a grey, a saturated blue, a bright yellow) can't carry either white or dark
 * text once it is faded: there is no shade that reads well on it. For those the profile's content sits on a mostly opaque
 * dark or light panel instead, and everything inside it reads as normal.
 */
export function panelFor(bg: Rgb): Panel | null {
  const preferred = isLightColor(bg) ? INK : WHITE;
  if (fadedTextReadable(preferred, bg)) return null;
  return luminance(bg) > 0.4 ? "light" : "dark";
}

/** What the panel looks like on screen, as one flat colour (for working out which text colours read on it). */
export const panelColor = (panel: Panel, bg: Rgb): Rgb => composite(panel === "light" ? WHITE : [12, 12, 18], PANEL_OPACITY, bg);

export const PANEL_STYLE = {
  dark: `rgba(12,12,18,${PANEL_OPACITY})`,
  light: `rgba(255,255,255,${PANEL_OPACITY})`,
} as const;

/** `text` softened toward `backdrop` for secondary lines, as far as it stays readable (otherwise `text` itself). */
export function mutedOn(text: Rgb, backdrop: Rgb): Rgb {
  const soft = composite(text, 0.75, backdrop);
  return contrastRatio(soft, backdrop) >= MIN_CONTRAST ? soft : text;
}
