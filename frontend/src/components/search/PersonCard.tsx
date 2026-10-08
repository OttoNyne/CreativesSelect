import { Link } from "react-router-dom";
import type { User } from "../../types";
import { Avatar } from "../common/Avatar";
import { Highlight } from "../common/Highlight";
import { CSBadge } from "../common/CSBadge";
import { t } from "../../i18n";

/** A person in a list: who they are, how they know you (when searching), what they are up to, and their tags. */
export function PersonCard({ user, onTag, words = [], mutualCount = 0, isFriend = false }: { user: User; onTag?: (tag: string) => void; words?: string[]; mutualCount?: number; isFriend?: boolean }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <Link to={`/u/${user.username}`} className="flex items-center gap-3 hover:underline">
        <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={40} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-white">
            <Highlight text={user.displayName} words={words} />
            <CSBadge verified={user.csVerified} size={14} className="ms-1" />
          </span>
          <span className="block truncate text-xs text-white/60">
            <bdi>@<Highlight text={user.username} words={words} /></bdi>
          </span>
        </span>
      </Link>
      {(isFriend || mutualCount > 0) && (
        <p className="mt-1.5 text-xs text-violet-300">
          {isFriend && t("friends.yourFriend")}
          {isFriend && mutualCount > 0 && " · "}
          {mutualCount > 0 && t("friends.inCommon", { n: mutualCount })}
        </p>
      )}
      {user.openToWork && <p className="mt-1.5 inline-block rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">{t("work.openToWork")}</p>}
      {user.mood && <p className="mt-1.5 truncate text-xs text-white/70">{user.mood}</p>}
      {user.bio && (
        <p className="mt-1 line-clamp-2 text-sm text-white/70">
          <Highlight text={user.bio} words={words} />
        </p>
      )}
      {onTag && user.tags && user.tags.length > 0 && (
        <ul aria-label={t("person.tagsAria", { name: user.displayName })} className="mt-2 flex flex-wrap gap-1.5">
          {user.tags.map((tag) => (
            <li key={tag}>
              <button type="button" onClick={() => onTag(tag)} aria-label={t("person.browseTag", { tag })} className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10">
                #{tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
