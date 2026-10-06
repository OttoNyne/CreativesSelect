import type { ProfileTheme } from "../types";

// How a person can style their profile: a handful of choices from fixed lists (the server checks them too), plus colours and a font.
// There is no custom CSS: whatever someone picks, the text stays readable and nothing on the page can be hidden or covered.

export const FONT_OPTIONS = [
  { label: "System sans-serif", value: "system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, serif" },
  { label: "Monospace", value: "'Courier New', monospace" },
  { label: "Rounded (Trebuchet)", value: "'Trebuchet MS', sans-serif" },
  { label: "Wide (Verdana)", value: "Verdana, Geneva, sans-serif" },
  { label: "Classic serif (Palatino)", value: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { label: "Friendly (Gill Sans)", value: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
  { label: "Playful (Comic Sans)", value: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive" },
  { label: "Poster (Impact)", value: "Impact, 'Arial Narrow Bold', sans-serif" },
  { label: "Terminal (Lucida)", value: "'Lucida Console', Monaco, monospace" },
];

export type StyleKey = "cardStyle" | "corners" | "density" | "headings" | "avatarShape" | "width";

export const STYLE_OPTIONS: Record<StyleKey, { label: string; default: string; choices: { value: string; label: string }[] }> = {
  cardStyle: {
    label: "Boxes",
    default: "solid",
    choices: [
      { value: "solid", label: "Solid" },
      { value: "outline", label: "Outline" },
      { value: "glass", label: "Glass" },
      { value: "flat", label: "Flat (no box)" },
    ],
  },
  corners: {
    label: "Corners",
    default: "rounded",
    choices: [
      { value: "square", label: "Square" },
      { value: "rounded", label: "Rounded" },
      { value: "soft", label: "Very round" },
    ],
  },
  density: {
    label: "Spacing",
    default: "comfortable",
    choices: [
      { value: "compact", label: "Tight" },
      { value: "comfortable", label: "Comfortable" },
      { value: "roomy", label: "Roomy" },
    ],
  },
  headings: {
    label: "Headings",
    default: "caps",
    choices: [
      { value: "caps", label: "Small capitals" },
      { value: "plain", label: "Plain" },
      { value: "serif", label: "Large serif" },
    ],
  },
  avatarShape: {
    label: "Picture",
    default: "circle",
    choices: [
      { value: "circle", label: "Circle" },
      { value: "rounded", label: "Rounded square" },
      { value: "square", label: "Square" },
    ],
  },
  width: {
    label: "Page width",
    default: "standard",
    choices: [
      { value: "narrow", label: "Narrow" },
      { value: "standard", label: "Standard" },
      { value: "wide", label: "Wide" },
    ],
  },
};
export const STYLE_KEYS = Object.keys(STYLE_OPTIONS) as StyleKey[];

/** Every setting a theme can hold, which is what is sent to the server (a missing one has to be sent as null to be cleared). */
export const THEME_KEYS = ["bgColor", "textColor", "accentColor", "fontFamily", ...STYLE_KEYS] as const;

/** A theme's choice for one setting, or the usual one if it has none (or something that isn't one of the choices). */
export function styleValue(theme: ProfileTheme | undefined, key: StyleKey): string {
  const chosen = theme?.[key];
  return STYLE_OPTIONS[key].choices.some((c) => c.value === chosen) ? (chosen as string) : STYLE_OPTIONS[key].default;
}

export const WIDTH_CLASS: Record<string, string> = { narrow: "max-w-2xl", standard: "max-w-3xl", wide: "max-w-5xl" };

/** The attributes a profile's page carries, which the styles in index.css respond to. */
export function styleAttributes(theme: ProfileTheme | undefined): Record<string, string> {
  return {
    "data-card": styleValue(theme, "cardStyle"),
    "data-corners": styleValue(theme, "corners"),
    "data-density": styleValue(theme, "density"),
    "data-headings": styleValue(theme, "headings"),
    "data-avatar": styleValue(theme, "avatarShape"),
  };
}

/** The theme as the server wants it: every setting present, with null for the ones that are not set (so they go back to the default). */
export function themeToSave(theme: ProfileTheme): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of THEME_KEYS) out[key] = (theme[key as keyof ProfileTheme] as string | undefined) || null;
  return out;
}

export interface StylePreset {
  name: string;
  label: string;
  hint: string;
  /** The look: every style setting it changes (the ones it leaves out go back to the usual). Colours are never changed by a preset. */
  settings: Partial<ProfileTheme>;
}

export const PRESETS: StylePreset[] = [
  { name: "default", label: "Default", hint: "Solid rounded boxes", settings: {} },
  { name: "minimal", label: "Minimal", hint: "No boxes, plain headings, lots of room", settings: { cardStyle: "flat", density: "roomy", headings: "plain", width: "narrow", corners: "square" } },
  { name: "classic", label: "Classic", hint: "Square outlined boxes, tight and wide, like an old profile page", settings: { cardStyle: "outline", corners: "square", density: "compact", avatarShape: "square", width: "wide", fontFamily: "Verdana, Geneva, sans-serif" } },
  { name: "gallery", label: "Gallery", hint: "Glass boxes, very round, a wide page for your work", settings: { cardStyle: "glass", corners: "soft", headings: "plain", width: "wide" } },
  { name: "journal", label: "Journal", hint: "Outlined, serif headings, a narrow page for reading", settings: { cardStyle: "outline", density: "roomy", headings: "serif", avatarShape: "rounded", width: "narrow", fontFamily: "Georgia, serif" } },
];

/** A preset applied to a theme: its look replaces every style setting (and the font), and the colours stay as they are. */
export function applyPreset(theme: ProfileTheme, preset: StylePreset): ProfileTheme {
  const next: ProfileTheme = { ...theme };
  for (const key of STYLE_KEYS) delete next[key];
  delete next.fontFamily;
  return { ...next, ...preset.settings };
}

/** The preset a theme is exactly (in every style setting and the font), if any. */
export function matchingPreset(theme: ProfileTheme | undefined): StylePreset | null {
  const font = theme?.fontFamily ?? FONT_OPTIONS[0].value;
  return (
    PRESETS.find((p) => STYLE_KEYS.every((k) => styleValue(theme, k) === styleValue(p.settings, k)) && font === (p.settings.fontFamily ?? FONT_OPTIONS[0].value)) ?? null
  );
}
