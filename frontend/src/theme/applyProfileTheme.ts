import type { CSSProperties } from "react";
import type { ProfileTheme } from "../types";
import {
  BRIGHTEST_WALLPAPER,
  WALLPAPER_SCRIM,
  isLightColor,
  mutedOn,
  panelColor,
  panelFor,
  parseColor,
  readableOn,
  textOn,
  toHex,
  type Panel,
  type Rgb,
} from "./contrast";

const DEFAULT_THEME: Required<ProfileTheme> = {
  bgColor: "#12121a",
  textColor: "#f5f5f7",
  accentColor: "#8b5cf6",
  fontFamily: "inherit",
  layoutStyle: "grid",
};

export type ProfileScheme = "light" | "dark";

export function resolveTheme(theme: ProfileTheme | undefined): Required<ProfileTheme> {
  return { ...DEFAULT_THEME, ...theme };
}

export interface ReadableTheme {
  /** "light" when the page behind the text is bright, so the page's white-on-dark styling flips to dark-on-light. */
  scheme: ProfileScheme;
  background: string;
  /** Set for a background in the mid-range, where nothing reads well: the content then sits on a dark or light panel. */
  panel: Panel | null;
  /** For secondary lines: the text colour softened, as far as it stays readable. */
  muted: string;
  /** The accent colour itself (as a plain hex). */
  accent: string;
  /** The owner's text colour, nudged only as far as needed to be readable on the background. */
  text: string;
  /** The accent as text (links, small buttons), nudged the same way. */
  accentText: string;
  /** The accent as the paint of a button: the accent, darkened or lightened just enough for its label to be readable. */
  accentFill: string;
  /** The label colour for a button painted accentFill (white or near-black). */
  onAccent: string;
}

/**
 * Whatever colours a profile owner picks, the text stays readable (WCAG AA, 4.5:1). With a wallpaper the page puts a dark
 * scrim over it, so the worst case is the brightest possible photo under that scrim, and the scheme is always dark.
 */
export function readableTheme(theme: ProfileTheme | undefined, hasWallpaper = false): ReadableTheme {
  const merged = resolveTheme(theme);
  const bg = parseColor(merged.bgColor) ?? (parseColor(DEFAULT_THEME.bgColor) as Rgb);
  const text = parseColor(merged.textColor) ?? (parseColor(DEFAULT_THEME.textColor) as Rgb);
  const accent = parseColor(merged.accentColor) ?? (parseColor(DEFAULT_THEME.accentColor) as Rgb);
  const label = parseColor(textOn(accent)) as Rgb;
  const fill = readableOn(accent, label);
  const panel = hasWallpaper ? null : panelFor(bg);
  const backdrop = hasWallpaper ? BRIGHTEST_WALLPAPER : panel ? panelColor(panel, bg) : bg;
  const scheme: ProfileScheme = hasWallpaper ? "dark" : panel ? (panel === "light" ? "light" : "dark") : isLightColor(bg) ? "light" : "dark";
  const readableText = readableOn(text, backdrop);
  return {
    scheme,
    panel,
    muted: toHex(mutedOn(readableText, backdrop)),
    background: toHex(bg),
    accent: toHex(accent),
    text: toHex(readableText),
    accentText: toHex(readableOn(accent, backdrop)),
    accentFill: toHex(fill),
    onAccent: toHex(label),
  };
}

export function profileThemeStyle(
  theme: ProfileTheme | undefined,
  wallpaperUrl?: string,
  wallpaperPosition = "50% 50%",
  /** True for a video wallpaper too (which isn't a CSS background), so the text is checked against it. */
  hasWallpaper = Boolean(wallpaperUrl),
): CSSProperties {
  const merged = resolveTheme(theme);
  const readable = readableTheme(theme, hasWallpaper);
  const base: CSSProperties = {
    "--profile-bg": readable.background,
    "--profile-text": readable.text,
    "--profile-muted": readable.muted,
    "--profile-accent": readable.accent,
    "--profile-accent-text": readable.accentText,
    "--profile-accent-fill": readable.accentFill,
    "--profile-on-accent": readable.onAccent,
    "--profile-font": merged.fontFamily,
    color: "var(--profile-text)",
    fontFamily: "var(--profile-font)",
  } as CSSProperties;

  if (wallpaperUrl) {
    return {
      ...base,
      backgroundColor: "var(--profile-bg)",
      backgroundImage: `linear-gradient(rgba(0,0,0,${WALLPAPER_SCRIM}), rgba(0,0,0,${WALLPAPER_SCRIM})), url("${wallpaperUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: wallpaperPosition,
      backgroundAttachment: "fixed",
    };
  }

  return { ...base, background: "var(--profile-bg)" };
}
