import type { CSSProperties } from "react";
import type { ProfileTheme } from "../types";

const DEFAULT_THEME: Required<ProfileTheme> = {
  bgColor: "#12121a",
  textColor: "#f5f5f7",
  accentColor: "#8b5cf6",
  fontFamily: "inherit",
  layoutStyle: "grid",
};

export function profileThemeStyle(theme: ProfileTheme | undefined): CSSProperties {
  const merged = { ...DEFAULT_THEME, ...theme };
  return {
    "--profile-bg": merged.bgColor,
    "--profile-text": merged.textColor,
    "--profile-accent": merged.accentColor,
    "--profile-font": merged.fontFamily,
    background: "var(--profile-bg)",
    color: "var(--profile-text)",
    fontFamily: "var(--profile-font)",
  } as CSSProperties;
}

export function resolveTheme(theme: ProfileTheme | undefined): Required<ProfileTheme> {
  return { ...DEFAULT_THEME, ...theme };
}
