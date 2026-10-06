import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { profilesApi } from "../../api/profiles.api";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import type { User } from "../../types";
import { Avatar } from "../common/Avatar";

export function TopFriendsList({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [topFriends, setTopFriends] = useState<User[]>([]);
  const [editing, setEditing] = useState(false);
  const [allFriends, setAllFriends] = useState<User[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    profilesApi
      .getTopFriends(username)
      .then(({ topFriends }) => {
        setTopFriends(topFriends);
        setSelected(topFriends.map((f) => f.username));
      })
      // e.g. a private profile: show the empty state rather than an unhandled rejection
      .catch(() => setTopFriends([]));
  }, [username]);

  async function startEditing() {
    try {
      const { friends } = await friendsApi.list();
      setAllFriends(friends);
      setEditing(true);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't load your friends.");
    }
  }

  function toggle(u: string) {
    setSelected((prev) => {
      if (prev.includes(u)) return prev.filter((x) => x !== u);
      if (prev.length >= 8) return prev;
      return [...prev, u];
    });
  }

  // The order is the order of the picked list: put the friend at place `from` at place `to` (by the buttons, or by dragging).
  function moveSelected(from: number, to: number) {
    if (from === to || to < 0 || to >= selected.length) return;
    const next = [...selected];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSelected(next);
    const person = allFriends.find((f) => f.username === moved);
    setAnnouncement(`Moved ${person?.displayName ?? moved} to position ${to + 1} of ${next.length}.`);
  }

  async function save() {
    setSaving(true);
    try {
      const { topFriends } = await profilesApi.setTopFriends(selected);
      setTopFriends(topFriends);
      setEditing(false);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't save your top friends.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-card rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="profile-heading text-sm font-semibold uppercase tracking-wide text-white/60">Top Friends</h2>
        {isOwner && !editing && (
          <button onClick={startEditing} className="text-xs text-[var(--profile-accent-text)] hover:underline">
            Edit
          </button>
        )}
      </div>

      {!editing && (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {topFriends.length === 0 && <p className="col-span-4 text-xs text-white/60">No top friends picked yet.</p>}
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
          <p className="text-xs text-white/60">Pick up to 8 friends ({selected.length}/8), then put them in the order you like</p>
          {selected.length > 0 && (
            <ol aria-label="Your top friends, in order" className="mt-2 space-y-1">
              {selected.map((u, i) => {
                const person = allFriends.find((f) => f.username === u);
                const name = person?.displayName ?? u;
                return (
                  <li
                    key={u}
                    draggable
                    onDragStart={(e) => {
                      setDragging(i);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", u); // Firefox won't start a drag without some data
                    }}
                    onDragOver={(e) => dragging !== null && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging !== null) moveSelected(dragging, i);
                      setDragging(null);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs ${dragging === i ? "opacity-50" : ""}`}
                  >
                    <span aria-hidden="true" title="Drag to rearrange" className="cursor-grab select-none text-white/60">
                      ⠿
                    </span>
                    <span className="w-4 text-white/60">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-white/80">{name}</span>
                    <button type="button" onClick={() => moveSelected(i, i - 1)} disabled={i === 0} aria-label={`Move ${name} up`} className="px-1.5 text-white/70 hover:text-white disabled:opacity-30">
                      ▲
                    </button>
                    <button type="button" onClick={() => moveSelected(i, i + 1)} disabled={i === selected.length - 1} aria-label={`Move ${name} down`} className="px-1.5 text-white/70 hover:text-white disabled:opacity-30">
                      ▼
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
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
            {allFriends.length === 0 && <p className="col-span-4 text-xs text-white/60">No friends yet.</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-[var(--profile-accent-fill)] px-3 py-1 text-xs font-medium text-[var(--profile-on-accent)] disabled:opacity-50"
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
