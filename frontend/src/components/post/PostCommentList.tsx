import { useEffect, useState } from "react";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import type { Comment } from "../../types";
import { Avatar } from "../common/Avatar";
import { useAuth } from "../../context/AuthContext";

export function PostCommentList({
  postId,
  onCountChange,
  highlightId = null,
}: {
  postId: string;
  onCountChange: (count: number) => void;
  /** A comment to scroll to and highlight once the list has loaded. */
  highlightId?: string | null;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    postsApi
      .comments(postId)
      .then(({ comments }) => setComments(comments))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the comments."))
      .finally(() => setLoading(false));
  }, [postId]);

  // Bring the comment a notification was about into view.
  useEffect(() => {
    if (!highlightId || loading) return;
    document.getElementById(`comment-${highlightId}`)?.scrollIntoView?.({ block: "center" });
  }, [highlightId, loading, comments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setError(null);
    try {
      const { comment } = await postsApi.addComment(postId, draft.trim());
      const next = [...comments, comment];
      setComments(next);
      onCountChange(next.length);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that comment.");
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
          <div>
            <span className="font-medium text-white/90">{c.author.displayName}</span>{" "}
            <span className="text-white/70">{c.content}</span>
          </div>
        </div>
      ))}
      {user && (
        <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
