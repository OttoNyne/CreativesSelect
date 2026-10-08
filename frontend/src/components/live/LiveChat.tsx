import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { liveApi, MAX_LIVE_COMMENT_LENGTH } from "../../api/live.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { LiveComment } from "../../types";

const DEFAULT_POLL_MS = 3_000;
const KEEP = 200; // comments kept on screen

// The live room's chat. Polls for anything newer than the last comment it has.
export function LiveChat({
  liveId,
  isHost,
  open,
  pollMs = DEFAULT_POLL_MS,
  onFresh,
}: {
  liveId: string;
  isHost: boolean;
  open: boolean;
  pollMs?: number;
  /** Called with how many new comments from other people have just arrived (for an unread count). */
  onFresh?: (count: number) => void;
}) {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const lastId = useRef<string | undefined>(undefined);
  const onFreshRef = useRef(onFresh);
  onFreshRef.current = onFresh;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { comments: fresh } = await liveApi.comments(liveId, lastId.current);
        if (cancelled || !fresh.length) return;
        const firstLoad = lastId.current === undefined;
        lastId.current = fresh[fresh.length - 1].id;
        const others = fresh.filter((c) => !c.mine).length;
        if (!firstLoad && others > 0) onFreshRef.current?.(others);
        setComments((prev) => [...prev, ...fresh.filter((c) => !prev.some((p) => p.id === c.id))].slice(-KEEP));
      } catch {
        // a failed poll just tries again next time
      }
    }
    poll();
    const timer = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [liveId, pollMs]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const { comment } = await liveApi.comment(liveId, body);
      lastId.current = comment.id;
      setComments((prev) => (prev.some((p) => p.id === comment.id) ? prev : [...prev, comment]).slice(-KEEP));
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that comment.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await liveApi.deleteComment(liveId, id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that comment.");
    }
  }

  return (
    <section aria-label="Live chat" className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.03]">
      <h2 className="border-b border-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white/60">Live chat</h2>
      <div ref={listRef} className="h-64 space-y-2 overflow-y-auto px-4 py-3">
        {comments.length === 0 && <p className="py-4 text-center text-sm text-white/60">No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex items-start gap-2 text-sm">
            {c.user && <Avatar username={c.user.username} displayName={c.user.displayName} avatarUrl={c.user.avatarUrl} size={24} />}
            <p className="min-w-0 flex-1 break-words text-white">
              {c.user ? (
                <Link to={`/u/${c.user.username}`} className="me-1.5 font-medium text-white/70 hover:underline">
                  {c.mine ? "You" : c.user.displayName}
                </Link>
              ) : (
                <span className="me-1.5 text-white/60">Former member</span>
              )}
              {c.body}
            </p>
            {(c.mine || isHost) && (
              <button onClick={() => handleDelete(c.id)} aria-label="Delete comment" className="text-xs text-white/60 hover:text-white">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="px-4 text-xs text-red-400">{error}</p>}
      {open ? (
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-white/10 p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_LIVE_COMMENT_LENGTH}
            placeholder="Say something…"
            aria-label="Comment"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      ) : (
        <p className="border-t border-white/10 p-3 text-center text-xs text-white/60">Join the live to chat.</p>
      )}
    </section>
  );
}
