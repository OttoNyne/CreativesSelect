import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { profileViewsApi } from "../../api/profileViews.api";
import type { ProfileVisitor } from "../../types";
import { Avatar } from "../common/Avatar";
import { formatCalendarDay } from "../../lib/when";
import { t } from "../../i18n";

/** For the owner, when they have profile views on: who has looked at their profile lately (only people who have it on too). */
export function ProfileVisitors() {
  const [visitors, setVisitors] = useState<ProfileVisitor[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    profileViewsApi
      .list()
      .then(({ visitors }) => !cancelled && setVisitors(visitors))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || visitors === null) return null;

  return (
    <section id="visitors" aria-label={t("profile.recentVisitors")} className="profile-card mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
      <h2 className="profile-heading text-sm font-semibold uppercase tracking-wide text-white/60">{t("profile.recentVisitors")}</h2>
      <p className="mt-1 text-xs text-white/60">{t("profile.onlyYouCanSee")}</p>
      {visitors.length === 0 ? (
        <p className="mt-3 text-sm text-white/60">{t("profile.noVisitorsToShow")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visitors.map((v) => (
            <li key={v.user.id} className="flex items-center gap-3">
              <Avatar username={v.user.username} displayName={v.user.displayName} avatarUrl={v.user.avatarUrl} size={32} />
              <Link to={`/u/${v.user.username}`} className="flex-1 truncate text-sm font-medium text-white hover:underline">
                {v.user.displayName}
              </Link>
              <span className="text-xs text-white/60">{t("profile.visited", { day: formatCalendarDay(v.day) })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
