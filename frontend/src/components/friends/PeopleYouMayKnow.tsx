import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { FriendSuggestion } from "../../types";

/** Friends of your friends you aren't connected to, most friends in common first. Add them, or say you aren't interested. */
export function PeopleYouMayKnow() {
  const [people, setPeople] = useState<FriendSuggestion[] | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    friendsApi
      .suggestions()
      .then(({ suggestions }) => current && setPeople(suggestions))
      .catch(() => current && setPeople([])); // suggestions are a nicety: a failure just shows none
    return () => {
      current = false;
    };
  }, []);

  async function add(username: string) {
    setError(null);
    try {
      await friendsApi.request(username);
      setSent((s) => [...s, username]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that request.");
    }
  }

  async function dismiss(username: string) {
    setError(null);
    try {
      await friendsApi.dismissSuggestion(username);
      setPeople((list) => (list ?? []).filter((p) => p.user.username !== username));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't do that.");
    }
  }

  if (!people || people.length === 0) return null;
  return (
    <section aria-label="People you may know">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">People you may know</h2>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {people.map(({ user, mutualCount, mutual }) => (
          <div key={user.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={36} />
            <span className="min-w-0 flex-1">
              <Link to={`/u/${user.username}`} className="block truncate font-medium text-white hover:underline">
                {user.displayName}
              </Link>
              <span className="block truncate text-xs text-white/60">
                {mutualCount} mutual {mutualCount === 1 ? "friend" : "friends"}: {mutual.map((m) => m.displayName).join(", ")}
                {mutualCount > mutual.length ? ` and ${mutualCount - mutual.length} more` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => add(user.username)}
              disabled={sent.includes(user.username)}
              className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {sent.includes(user.username) ? "Request sent" : "Add friend"}
            </button>
            <button type="button" onClick={() => dismiss(user.username)} aria-label={`Not interested in ${user.displayName}`} title="Not interested" className="text-xs text-white/60 hover:text-white">
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
