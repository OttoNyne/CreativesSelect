import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { spotlightsApi, type Spotlight } from "../../api/spotlights.api";
import { Avatar } from "../common/Avatar";
import { CSBadge } from "../common/CSBadge";
import { t } from "../../i18n";

function Card({ spot }: { spot: Spotlight }) {
  const { user, piece, note } = spot;
  return (
    <li className="cs-fade-in overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      {piece ? (
        <Link to={`/u/${user.username}`} tabIndex={-1} aria-hidden="true" className="block">
          <img src={piece.url} alt="" loading="lazy" className="aspect-[4/3] w-full bg-black/20 object-cover" />
        </Link>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-black/20" aria-hidden="true">
          <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={96} />
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-3">
          <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={40} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-base font-semibold text-white">
              <Link to={`/u/${user.username}`} className="truncate hover:underline">
                {user.displayName}
              </Link>
              <CSBadge verified={user.csVerified} size={16} />
            </p>
            {user.headline && (
              <p dir="auto" className="truncate text-sm text-white/80">
                {user.headline}
              </p>
            )}
          </div>
        </div>
        {note && (
          <p dir="auto" className="text-sm text-white/85">
            {note}
          </p>
        )}
        {user.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("profile.tags")}>
            {user.tags.map((tag) => (
              <li key={tag} className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/75">
                #{tag}
              </li>
            ))}
          </ul>
        )}
        <Link to={`/u/${user.username}`} aria-label={t("spotlight.viewProfileAria", { name: user.displayName })} className="inline-block text-sm font-medium text-violet-300 hover:underline">
          {t("spotlight.viewProfile")}
        </Link>
      </div>
    </li>
  );
}

/**
 * The two artist spotlights an administrator chose, side by side (stacked on a phone). It shows nothing until they have loaded, and nothing
 * at all when no one is in either slot, so an empty main screen isn't a page with a hole in it.
 */
export function SpotlightSlots({ className = "" }: { className?: string }) {
  const [spots, setSpots] = useState<Spotlight[] | null>(null);

  useEffect(() => {
    let live = true;
    spotlightsApi
      .list()
      .then(({ spotlights }) => live && setSpots(spotlights))
      .catch(() => live && setSpots([]));
    return () => {
      live = false;
    };
  }, []);

  if (!spots || spots.length === 0) return null;
  return (
    <section aria-label={t("spotlight.heading")} className={className}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">{t("spotlight.heading")}</h2>
      <ul className={`grid gap-4 ${spots.length > 1 ? "sm:grid-cols-2" : "sm:max-w-md"}`}>
        {spots.map((spot) => (
          <Card key={spot.slot} spot={spot} />
        ))}
      </ul>
    </section>
  );
}
