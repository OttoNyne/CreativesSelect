import { useAuth } from "../context/AuthContext";
import { FeedPage } from "./FeedPage";
import { LandingPage } from "./LandingPage";
import { t } from "../i18n";

/** The main screen at "/": the feed for someone signed in, and the public landing page (with the artist spotlights) for everyone else. */
export function HomePage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 text-center text-white/60">{t("common.loading")}</div>;
  return user ? <FeedPage /> : <LandingPage />;
}
