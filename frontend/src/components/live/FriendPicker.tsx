import { useEffect, useState } from "react";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { User } from "../../types";
import { t } from "../../i18n";

/**
 * Pick some of your friends from a list of checkboxes. `selected` is the ids chosen; `onChange` gets the new list. The friends are fetched when
 * this first appears. `max` stops more than that many being chosen.
 */
export function FriendPicker({ selected, onChange, max = 100 }: { selected: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const [friends, setFriends] = useState<User[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    friendsApi
      .list()
      .then(({ friends: found }) => live && setFriends(found))
      .catch((err) => live && setProblem(err instanceof ApiError ? err.message : t("privatelive.loadFailed")));
    return () => {
      live = false;
    };
  }, []);

  function toggle(id: string) {
    if (selected.includes(id)) return onChange(selected.filter((x) => x !== id));
    if (selected.length < max) onChange([...selected, id]);
  }

  if (problem) {
    return (
      <p role="alert" className="text-sm text-red-400">
        {problem}
      </p>
    );
  }
  if (friends === null) return <p className="text-sm text-white/60">{t("common.loading")}</p>;
  if (friends.length === 0) return <p className="text-sm text-white/70">{t("privatelive.noFriends")}</p>;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-white/80">{t("privatelive.pick")}</legend>
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-white/10 bg-black/20 p-2">
        {friends.map((friend) => (
          <li key={friend.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-white hover:bg-white/5">
              <input type="checkbox" checked={selected.includes(friend.id)} onChange={() => toggle(friend.id)} className="size-4" />
              <Avatar username={friend.username} displayName={friend.displayName} avatarUrl={friend.avatarUrl} size={24} />
              <span className="min-w-0 flex-1 truncate">{friend.displayName}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-white/60" aria-live="polite">
        {t("privatelive.picked", { n: selected.length })}
      </p>
    </fieldset>
  );
}
