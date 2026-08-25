import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { profilesApi } from "../../api/profiles.api";
import { friendsApi } from "../../api/friends.api";
import type { User } from "../../types";
import { Avatar } from "../common/Avatar";

export function TopFriendsList({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [topFriends, setTopFriends] = useState<User[]>([]);
  const [editing, setEditing] = useState(false);
  const [allFriends, setAllFriends] = useState<User[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profilesApi.getTopFriends(username).then(({ topFriends }) => {
      setTopFriends(topFriends);
      setSelected(topFriends.map((f) => f.username));
    });
  }, [username]);

  async function startEditing() {
    const { friends } = await friendsApi.list();
    setAllFriends(friends);
    setEditing(true);
  }

  function toggle(u: string) {
    setSelected((prev) => {
      if (prev.includes(u)) return prev.filter((x) => x !== u);
      if (prev.length >= 8) return prev;
      return [...prev, u];
    });
  }

  async function save() {
    setSaving(true);
    try {
      const { topFriends } = await profilesApi.setTopFriends(selected);
      setTopFriends(topFriends);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Top Friends</h2>
        {isOwner && !editing && (
          <button onClick={startEditing} className="text-xs text-[var(--profile-accent)] hover:underline">
            Edit
          </button>
        )}
      </div>

      {!editing && (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {topFriends.length === 0 && <p className="col-span-4 text-xs text-white/40">No top friends picked yet.</p>}
          {topFriends.map((f) => (
            <Link key={f.id} to={`/u/${f.username}`} className="flex flex-col items-center gap-1 text-center">
              <Avatar username={f.username} displayName={f.displayName} avatarUrl={f.avatarUrl} size={56} />
              <span className="text-xs text-white/80">{f.displayName}</span>
            </Link>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <p className="text-xs text-white/40">Pick up to 8 friends ({selected.length}/8)</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {allFriends.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.username)}
                className={`flex flex-col items-center gap-1 rounded-md p-2 text-center ${
                  selected.includes(f.username) ? "bg-[var(--profile-accent)]/20 ring-1 ring-[var(--profile-accent)]" : "hover:bg-white/5"
                }`}
              >
                <Avatar username={f.username} displayName={f.displayName} avatarUrl={f.avatarUrl} size={48} />
                <span className="text-xs text-white/80">{f.displayName}</span>
              </button>
            ))}
            {allFriends.length === 0 && <p className="col-span-4 text-xs text-white/40">No friends yet.</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-[var(--profile-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-md border border-white/15 px-3 py-1 text-xs text-white/70">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
