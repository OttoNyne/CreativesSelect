import type { ProfileTheme } from "../types";
import { t } from "../i18n";

// How a person can style their profile: a handful of choices from fixed lists (the server checks them too), plus colours and a font.
// There is no custom CSS: whatever someone picks, the text stays readable and nothing on the page can be hidden or covered.

export const FONT_OPTIONS = [
  { get label() { return t("style.systemSansSerif"); }, value: "system-ui, sans-serif" },
  { get label() { return t("style.serifGeorgia"); }, value: "Georgia, serif" },
  { get label() { return t("style.monospace"); }, value: "'Courier New', monospace" },
  { get label() { return t("style.roundedTrebuchet"); }, value: "'Trebuchet MS', sans-serif" },
  { get label() { return t("style.wideVerdana"); }, value: "Verdana, Geneva, sans-serif" },
  { get label() { return t("style.classicSerifPalatino"); }, value: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { get label() { return t("style.friendlyGillSans"); }, value: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
  { get label() { return t("style.playfulComicSans"); }, value: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive" },
  { get label() { return t("style.posterImpact"); }, value: "Impact, 'Arial Narrow Bold', sans-serif" },
  { get label() { return t("style.terminalLucida"); }, value: "'Lucida Console', Monaco, monospace" },
];

export type StyleKey = "cardStyle" | "corners" | "density" | "headings" | "avatarShape" | "width";

export const STYLE_OPTIONS: Record<StyleKey, { label: string; default: string; choices: { value: string; label: string }[] }> = {
  cardStyle: {
    get label() { return t("style.boxes"); },
    default: "solid",
    choices: [
      { value: "solid", get label() { return t("style.solid"); } },
      { value: "outline", get label() { return t("style.outline"); } },
      { value: "glass", get label() { return t("style.glass"); } },
      { value: "flat", get label() { return t("style.flatNoBox"); } },
    ],
  },
  corners: {
    get label() { return t("style.corners"); },
    default: "rounded",
    choices: [
      { value: "square", get label() { return t("adjust.square"); } },
      { value: "rounded", get label() { return t("style.rounded"); } },
      { value: "soft", get label() { return t("style.veryRound"); } },
    ],
  },
  density: {
    get label() { return t("style.spacing"); },
    default: "comfortable",
    choices: [
      { value: "compact", get label() { return t("style.tight"); } },
      { value: "comfortable", get label() { return t("style.comfortable"); } },
      { value: "roomy", get label() { return t("style.roomy"); } },
    ],
  },
  headings: {
    get label() { return t("style.headings"); },
    default: "caps",
    choices: [
      { value: "caps", get label() { return t("style.smallCapitals"); } },
      { value: "plain", get label() { return t("style.plain"); } },
      { value: "serif", get label() { return t("style.largeSerif"); } },
    ],
  },
  avatarShape: {
    get label() { return t("style.picture"); },
    default: "circle",
    choices: [
      { value: "circle", get label() { return t("style.circle"); } },
      { value: "rounded", get label() { return t("style.roundedSquare"); } },
      { value: "square", get label() { return t("adjust.square"); } },
    ],
  },
  width: {
    get label() { return t("style.pageWidth"); },
    default: "standard",
    choices: [
      { value: "narrow", get label() { return t("style.narrow"); } },
      { value: "standard", get label() { return t("style.standard"); } },
      { value: "wide", get label() { return t("adjust.wide"); } },
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
  { name: "default", get label() { return t("style.default"); }, get hint() { return t("style.solidRoundedBoxes"); }, settings: {} },
  { name: "minimal", get label() { return t("style.minimal"); }, get hint() { return t("style.noBoxesPlainHeadings"); }, settings: { cardStyle: "flat", density: "roomy", headings: "plain", width: "narrow", corners: "square" } },
  { name: "classic", get label() { return t("style.classic"); }, get hint() { return t("style.squareOutlinedBoxesTight"); }, settings: { cardStyle: "outline", corners: "square", density: "compact", avatarShape: "square", width: "wide", fontFamily: "Verdana, Geneva, sans-serif" } },
  { name: "gallery", get label() { return t("style.gallery"); }, get hint() { return t("style.glassBoxesVeryRound"); }, settings: { cardStyle: "glass", corners: "soft", headings: "plain", width: "wide" } },
  { name: "journal", get label() { return t("style.journal"); }, get hint() { return t("style.outlinedSerifHeadingsA"); }, settings: { cardStyle: "outline", density: "roomy", headings: "serif", avatarShape: "rounded", width: "narrow", fontFamily: "Georgia, serif" } },
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
