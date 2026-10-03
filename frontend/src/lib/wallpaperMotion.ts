import type { WallpaperMotion } from "../types";

/** The ways a picture wallpaper can move behind a profile (the picture stays a still image; the browser animates it). */
export const WALLPAPER_MOTIONS: { value: WallpaperMotion; label: string; hint: string }[] = [
  { value: "none", label: "Still", hint: "The picture stays put." },
  { value: "zoom", label: "Slow zoom", hint: "Gently drifts in and out." },
  { value: "drift", label: "Drift", hint: "Floats slowly across the picture." },
  { value: "pan", label: "Pan", hint: "Sweeps slowly from side to side." },
  { value: "pulse", label: "Pulse", hint: "Light and colour slowly breathe." },
];

export const isWallpaperMotion = (value: unknown): value is WallpaperMotion => WALLPAPER_MOTIONS.some((m) => m.value === value);

/** What to use for a profile that doesn't say (older profiles, or one that isn't loaded yet). */
export const motionOf = (value: unknown): WallpaperMotion => (isWallpaperMotion(value) ? value : "none");
