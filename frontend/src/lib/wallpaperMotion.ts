import type { WallpaperMotion } from "../types";
import { t } from "../i18n";

/** The ways a picture wallpaper can move behind a profile (the picture stays a still image; the browser animates it). */
export const WALLPAPER_MOTIONS: { value: WallpaperMotion; label: string; hint: string }[] = [
  { value: "none", get label() { return t("style.still"); }, get hint() { return t("style.thePictureStaysPut"); } },
  { value: "zoom", get label() { return t("style.slowZoom"); }, get hint() { return t("style.gentlyDriftsInAnd"); } },
  { value: "drift", get label() { return t("style.drift"); }, get hint() { return t("style.floatsSlowlyAcrossThe"); } },
  { value: "pan", get label() { return t("style.pan"); }, get hint() { return t("style.sweepsSlowlyFromSide"); } },
  { value: "pulse", get label() { return t("style.pulse"); }, get hint() { return t("style.lightAndColourSlowly"); } },
];

export const isWallpaperMotion = (value: unknown): value is WallpaperMotion => WALLPAPER_MOTIONS.some((m) => m.value === value);

/** What to use for a profile that doesn't say (older profiles, or one that isn't loaded yet). */
export const motionOf = (value: unknown): WallpaperMotion => (isWallpaperMotion(value) ? value : "none");
