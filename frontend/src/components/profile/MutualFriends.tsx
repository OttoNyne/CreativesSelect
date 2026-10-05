import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { friendsApi } from "../../api/friends.api";
import { Avatar } from "../common/Avatar";
import type { ProfileMutual } from "../../types";

/** "3 mutual friends: Ann, Bob and Cara": the friends you and this person share. Nothing at all when there are none (or they keep them private). */
export function MutualFriends({ username }: { username: string }) {
  const [mutual, setMutual] = useState<ProfileMutual | null>(null);

  useEffect(() => {
    let current = true;
    friendsApi
      .mutual(username)
      .then((m) => current && setMutual(m))
      .catch(() => current && setMutual(null)); // e.g. a profile you can't see: nothing to show
    return () => {
      current = false;
    };
  }, [username]);

  if (!mutual || mutual.count === 0) return null;
  const more = mutual.count - mutual.friends.length;
  return (
    <section aria-label="Mutual friends" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--profile-muted)]">
      <span>
        {mutual.count} mutual {mutual.count === 1 ? "friend" : "friends"}:
      </span>
      {mutual.friends.map((f) => (
        <Link key={f.id} to={`/u/${f.username}`} className="flex items-center gap-1.5 rounded-full border border-white/10 py-0.5 pl-0.5 pr-2.5 text-xs hover:bg-white/10">
          <Avatar username={f.username} displayName={f.displayName} avatarUrl={f.avatarUrl} size={20} />
          {f.displayName}
        </Link>
      ))}
      {more > 0 && <span className="text-xs">and {more} more</span>}
    </section>
  );
}
