import { Link } from "react-router-dom";
import type { User } from "../../types";
import { Avatar } from "../common/Avatar";
import { Highlight } from "../common/Highlight";
import { CSBadge } from "../common/CSBadge";

/** A person in a list: who they are, how they know you (when searching), what they are up to, and their tags. */
export function PersonCard({ user, onTag, words = [], mutualCount = 0, isFriend = false }: { user: User; onTag?: (tag: string) => void; words?: string[]; mutualCount?: number; isFriend?: boolean }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <Link to={`/u/${user.username}`} className="flex items-center gap-3 hover:underline">
        <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={40} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-white">
            <Highlight text={user.displayName} words={words} />
            <CSBadge verified={user.csVerified} size={14} className="ml-1" />
          </span>
          <span className="block truncate text-xs text-white/60">
            @<Highlight text={user.username} words={words} />
          </span>
        </span>
      </Link>
      {(isFriend || mutualCount > 0) && (
        <p className="mt-1.5 text-xs text-violet-300">
          {isFriend && "Your friend"}
          {isFriend && mutualCount > 0 && " · "}
          {mutualCount > 0 && `${mutualCount} ${mutualCount === 1 ? "friend" : "friends"} in common`}
        </p>
      )}
      {user.mood && <p className="mt-1.5 truncate text-xs text-white/70">{user.mood}</p>}
      {user.bio && (
        <p className="mt-1 line-clamp-2 text-sm text-white/70">
          <Highlight text={user.bio} words={words} />
        </p>
      )}
      {onTag && user.tags && user.tags.length > 0 && (
        <ul aria-label={`${user.displayName}'s tags`} className="mt-2 flex flex-wrap gap-1.5">
          {user.tags.map((t) => (
            <li key={t}>
              <button type="button" onClick={() => onTag(t)} aria-label={`Browse everyone tagged ${t}`} className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10">
                #{t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
