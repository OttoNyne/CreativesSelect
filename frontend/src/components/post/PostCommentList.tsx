import { useEffect, useState } from "react";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import type { Comment } from "../../types";
import { Avatar } from "../common/Avatar";
import { EditBox } from "../common/EditBox";
import { EditedMark } from "../common/EditedMark";
import { useAuth } from "../../context/AuthContext";

const MAX_COMMENT = 1000;

export function PostCommentList({
  postId,
  onCountChange,
  highlightId = null,
}: {
  postId: string;
  /** Told when a comment is added, as a change to the post's count (the list may hold only some of the comments). */
  onCountChange: (update: (count: number) => number) => void;
  /** A comment to scroll to and highlight once the list has loaded. */
  highlightId?: string | null;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    postsApi
      .comments(postId)
      .then(({ comments, hasMore }) => {
        setComments(comments);
        setHasMore(Boolean(hasMore));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the comments."))
      .finally(() => setLoading(false));
  }, [postId]);

  // Bring the comment a notification was about into view.
  useEffect(() => {
    if (!highlightId || loading) return;
    document.getElementById(`comment-${highlightId}`)?.scrollIntoView?.({ block: "center" });
  }, [highlightId, loading, comments]);

  async function showMore() {
    const last = comments[comments.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await postsApi.comments(postId, last.id);
      setComments((old) => [...old, ...next.comments.filter((c) => !old.some((o) => o.id === c.id))]);
      setHasMore(Boolean(next.hasMore));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load more comments.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setError(null);
    try {
      const { comment } = await postsApi.addComment(postId, draft.trim());
      setComments((old) => [...old, comment]);
      onCountChange((n) => n + 1);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that comment.");
    }
  }

  async function saveEdit(id: string, text: string): Promise<string | null> {
    try {
      const { comment } = await postsApi.updateComment(id, text);
      setComments((old) => old.map((c) => (c.id === id ? comment : c)));
      setEditing(null);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Couldn't save that change.";
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
      {loading && <div className="text-xs text-white/60">Loading comments…</div>}
      {comments.map((c) => (
        <div
          key={c.id}
          id={`comment-${c.id}`}
          aria-current={c.id === highlightId ? "true" : undefined}
          className={`flex gap-2 rounded-md text-sm ${c.id === highlightId ? "bg-violet-500/15 p-1.5 ring-1 ring-violet-400/50" : ""}`}
        >
          <Avatar username={c.author.username} displayName={c.author.displayName} avatarUrl={c.author.avatarUrl} size={24} />
          <div className="min-w-0 flex-1">
            {editing === c.id ? (
              <EditBox text={c.content} maxText={MAX_COMMENT} label="Edit comment" rows={2} onSave={({ text }) => saveEdit(c.id, text)} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <span className="font-medium text-white/90">{c.author.displayName}</span> <span className="whitespace-pre-line break-words text-white/70">{c.content}</span> <EditedMark editedAt={c.editedAt} />
                {user?.id === c.author.id && (
                  <button type="button" onClick={() => setEditing(c.id)} aria-label={`Edit your comment: ${c.content.slice(0, 30)}`} className="ml-2 text-xs text-white/60 hover:text-white hover:underline">
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      {hasMore && (
        <button type="button" onClick={showMore} disabled={loadingMore} className="text-xs text-violet-300 hover:underline disabled:opacity-50">
          {loadingMore ? "Loading…" : "Show more comments"}
        </button>
      )}
      {user && (
        <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_COMMENT}
            placeholder="Write a comment…"
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500">
            Post
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
