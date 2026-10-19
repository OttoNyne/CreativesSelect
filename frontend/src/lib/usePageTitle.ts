import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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
  [/^\/privacy$/, "legal.privacy.title"],
  [/^\/terms$/, "legal.terms.title"],
  [/^\/guidelines$/, "legal.guidelines.title"],
  [/^\/friends$/, "nav.friends"],
  [/^\/messages(?:\/[^/]+)?$/, "messages.title"],
  [/^\/live(?:\/[^/]+)?$/, "nav.live"],
  [/^\/groups$/, "nav.groups"],
  [/^\/groups\/[^/]+$/, "pageTitle.group"],
  [/^\/search$/, "nav.search"],
  [/^\/posts\/[^/]+$/, "pageTitle.post"],
  [/^\/help-wanted$/, "nav.helpWanted"],
  [/^\/challenge$/, "challenge.title"],
  [/^\/sketch$/, "play.title"],
  [/^\/chains(?:\/[^/]+)*$/, "chain.title"],
  [/^\/explore$/, "explore.title"],
  [/^\/saved$/, "saves.title"],
  [/^\/calls(?:\/[^/]+)?$/, "calls.title"],
  [/^\/projects(?:\/[^/]+)?$/, "projects.title"],
  [/^\/critiques(?:\/[^/]+)?$/, "critique.title"],
  [/^\/u\/([^/]+)$/, ""],
];

/** The tab title for an address. The main screen ("/") is the feed for someone signed in and the landing page for everyone else. */
export function titleForPath(pathname: string, signedIn = true): string {
  if (pathname === "/" && !signedIn) return `${t("landing.title")} · CreativesSelect`;
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
export function usePageTitle(signedIn = true) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname, signedIn);
  }, [pathname, signedIn]);
}

/** Keeps the tab title right; it sits inside the sign-in provider so it knows whether the main screen is the feed or the landing page. */
export function PageTitle() {
  const { user, isLoading } = useAuth();
  usePageTitle(isLoading || Boolean(user));
  return null;
}
