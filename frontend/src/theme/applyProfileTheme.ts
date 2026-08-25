import type { CSSProperties } from "react";
import type { ProfileTheme } from "../types";

const DEFAULT_THEME: Required<ProfileTheme> = {
  bgColor: "#12121a",
  textColor: "#f5f5f7",
  accentColor: "#8b5cf6",
  fontFamily: "inherit",
  layoutStyle: "grid",
};

export function profileThemeStyle(
  theme: ProfileTheme | undefined,
  wallpaperUrl?: string,
  wallpaperPosition = "50% 50%",
): CSSProperties {
  const merged = { ...DEFAULT_THEME, ...theme };
  const base: CSSProperties = {
    "--profile-bg": merged.bgColor,
    "--profile-text": merged.textColor,
    "--profile-accent": merged.accentColor,
    "--profile-font": merged.fontFamily,
    color: "var(--profile-text)",
    fontFamily: "var(--profile-font)",
  } as CSSProperties;

  if (wallpaperUrl) {
    return {
      ...base,
      backgroundColor: "var(--profile-bg)",
      backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url("${wallpaperUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: wallpaperPosition,
      backgroundAttachment: "fixed",
    };
  }

  return { ...base, background: "var(--profile-bg)" };
}

export function resolveTheme(theme: ProfileTheme | undefined): Required<ProfileTheme> {
  return { ...DEFAULT_THEME, ...theme };
}
