import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { t, type Key } from "../i18n";

// the key of the title for each address (looked up when the title is set, so it is in the language of the page)
const TITLES: [RegExp, Key | ""][] = [
  [/^\/$/, "nav.feed"],
  [/^\/login$/, "common.logIn"],
  [/^\/register$/, "common.signUp"],
  [/^\/forgot-password$/, "pageTitle.forgot"],
  [/^\/reset-password$/, "pageTitle.reset"],
  [/^\/verify-email$/, "pageTitle.confirm"],
  [/^\/about$/, "footer.about"],
  [/^\/features$/, "footer.features"],
  [/^\/how-it-works$/, "footer.howItWorks"],
  [/^\/friends$/, "nav.friends"],
  [/^\/messages(?:\/[^/]+)?$/, "messages.title"],
  [/^\/live(?:\/[^/]+)?$/, "nav.live"],
  [/^\/groups$/, "nav.groups"],
  [/^\/groups\/[^/]+$/, "pageTitle.group"],
  [/^\/search$/, "nav.search"],
  [/^\/posts\/[^/]+$/, "pageTitle.post"],
  [/^\/help-wanted$/, "nav.helpWanted"],
  [/^\/challenge$/, "challenge.title"],
  [/^\/explore$/, "explore.title"],
  [/^\/u\/([^/]+)$/, ""],
];

export function titleForPath(pathname: string): string {
  for (const [pattern, key] of TITLES) {
    const title = key ? t(key) : "";
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
