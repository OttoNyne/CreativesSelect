import { Link } from "react-router-dom";
import { t } from "../../i18n";

/** The owner's mood and what they are listening to: two short lines, shown as plain text. */
export function ProfileMood({ mood, listeningTo }: { mood?: string; listeningTo?: string }) {
  if (!mood && !listeningTo) return null;
  return (
    <ul aria-label={t("profile.status")} className="mt-1 space-y-0.5 text-sm text-[var(--profile-muted)]">
      {mood && <li>{mood}</li>}
      {listeningTo && (
        <li>
          <span aria-hidden="true">♪ </span>
          <span className="sr-only">{t("profile.listeningToColon")} </span>
          {listeningTo}
        </li>
      )}
    </ul>
  );
}

/** What someone does, as chips that lead to others who do the same. */
export function ProfileTags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <ul aria-label={t("profile.tags")} className="mt-3 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag}>
          <Link
            to={`/search?tag=${encodeURIComponent(tag)}`}
            aria-label={t("profile.findTagged", { tag })}
            className="inline-block rounded-full border border-[var(--profile-accent)] px-2.5 py-0.5 text-xs text-[var(--profile-accent-text)] hover:bg-white/10"
          >
            #{tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}
