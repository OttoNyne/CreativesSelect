import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Feed"],
  [/^\/login$/, "Log in"],
  [/^\/register$/, "Sign up"],
  [/^\/friends$/, "Friends"],
  [/^\/messages(\/[^/]+)?$/, "Messages"],
  [/^\/groups$/, "Groups"],
  [/^\/groups\/[^/]+$/, "Group"],
  [/^\/search$/, "Search"],
  [/^\/help-wanted$/, "Help wanted"],
  [/^\/u\/([^/]+)$/, ""],
];

export function titleForPath(pathname: string): string {
  for (const [pattern, title] of TITLES) {
    const match = pathname.match(pattern);
    if (!match) continue;
    if (match[1]) return `@${decodeURIComponent(match[1])} · CreativesSelect`;
    return title ? `${title} · CreativesSelect` : "CreativesSelect";
  }
  return "CreativesSelect";
}

// Keeps the browser tab / history entries meaningful as the SPA navigates.
export function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
}
