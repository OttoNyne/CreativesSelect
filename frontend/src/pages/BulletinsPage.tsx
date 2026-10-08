import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { bulletinsApi, BULLETINS_CHANGED_EVENT, MAX_BULLETIN_BODY, MAX_BULLETIN_TITLE } from "../api/bulletins.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import { EditBox } from "../components/common/EditBox";
import { EditedMark } from "../components/common/EditedMark";
import { daysLeft, formatDay } from "../lib/when";
import type { Bulletin } from "../types";

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

// The bulletin board: short messages to all of your friends at once, from them and from you. They come down after ten days.
export function BulletinsPage() {
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bulletinsApi
      .list()
      .then(({ bulletins }) => {
        if (cancelled) return;
        setBulletins(bulletins);
        setState("ready");
        // having looked, nothing on the board is new any more
        bulletinsApi
          .markSeen()
          .then(() => window.dispatchEvent(new Event(BULLETINS_CHANGED_EVENT)))
          .catch(() => {});
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (posting) return;
    if (!title.trim()) return setError("Give your bulletin a title");
    if (!body.trim()) return setError("Write something in your bulletin");
    setPosting(true);
    setError(null);
    try {
      const { bulletin } = await bulletinsApi.create({ title, body });
      setBulletins((old) => [bulletin, ...old]);
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post your bulletin.");
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit(bulletin: Bulletin, value: { text: string; title?: string }): Promise<string | null> {
    try {
      const { bulletin: updated } = await bulletinsApi.update(bulletin.id, { title: value.title, body: value.text });
      setBulletins((old) => old.map((b) => (b.id === bulletin.id ? updated : b)));
      setEditing(null);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Couldn't save that change.";
    }
  }

  async function handleDelete(bulletin: Bulletin) {
    if (!window.confirm(`Take down "${bulletin.title}"?`)) return;
    try {
      await bulletinsApi.remove(bulletin.id);
      setBulletins((old) => old.filter((b) => b.id !== bulletin.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't take that down.");
    }
  }

  async function handleReport(bulletin: Bulletin) {
    const reason = prompt("What's the issue with this bulletin?");
    if (!reason) return;
    try {
      await moderationApi.report("bulletin", bulletin.id, reason);
      alert("Report submitted. Thanks for helping keep this space safe.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't submit that report.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link to="/" className="text-sm text-violet-400 hover:underline">
        ← Back to your feed
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-white">Bulletins</h1>
        <p className="text-sm text-white/60">A short message to all of your friends at once. Only your friends can read it, and it comes down after 10 days.</p>
      </div>

      <form onSubmit={handlePost} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_BULLETIN_TITLE} placeholder="Title" aria-label="Bulletin title" className={field} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_BULLETIN_BODY} rows={4} placeholder="What do your friends need to know?" aria-label="Bulletin text" className={field} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-white/60" aria-live="polite">
            {body.length} / {MAX_BULLETIN_BODY}
          </span>
          <button type="submit" disabled={posting} className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {posting ? "Posting…" : "Post bulletin"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      {state === "loading" && <p className="p-6 text-center text-white/60">Loading…</p>}
      {state === "error" && (
        <p role="alert" className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-red-400">
          Couldn&apos;t load the bulletins. Please try again.
        </p>
      )}
      {state === "ready" && bulletins.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/60">No bulletins yet. Post one, or add friends to see theirs.</p>
      )}
      <ul className="space-y-3">
        {bulletins.map((b) => (
          <li key={b.id}>
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Avatar username={b.author.username} displayName={b.author.displayName} avatarUrl={b.author.avatarUrl} size={28} />
                <Link to={`/u/${b.author.username}`} className="font-medium text-white hover:underline">
                  {b.isMine ? "You" : b.author.displayName}
                </Link>
                <span aria-hidden="true">·</span>
                <time dateTime={b.createdAt}>{formatDay(b.createdAt)}</time>
                <span className="ms-auto text-xs text-white/60">{daysLeft(b.expiresAt)}</span>
              </div>
              {editing === b.id ? (
                <EditBox title={b.title} maxTitle={MAX_BULLETIN_TITLE} text={b.body} maxText={MAX_BULLETIN_BODY} label="Edit bulletin" onSave={(value) => saveEdit(b, value)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <h2 className="mt-2 font-semibold text-white">
                    {b.title} <EditedMark editedAt={b.editedAt} />
                  </h2>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-white/85">{b.body}</p>
                </>
              )}
              <div className="mt-3 flex gap-2">
                {b.isMine && editing !== b.id && (
                  <button type="button" onClick={() => setEditing(b.id)} aria-label={`Edit ${b.title}`} className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10">
                    Edit
                  </button>
                )}
                {b.isMine ? (
                  <button type="button" onClick={() => handleDelete(b)} aria-label={`Take down ${b.title}`} className="rounded-md border border-red-400/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">
                    Take down
                  </button>
                ) : (
                  <button type="button" onClick={() => handleReport(b)} aria-label={`Report ${b.title}`} className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10">
                    Report
                  </button>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
