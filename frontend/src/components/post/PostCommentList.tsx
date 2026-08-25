import { useEffect, useState } from "react";
import { postsApi } from "../../api/posts.api";
import type { Comment } from "../../types";
import { Avatar } from "../common/Avatar";
import { useAuth } from "../../context/AuthContext";

export function PostCommentList({
  postId,
  onCountChange,
}: {
  postId: string;
  onCountChange: (count: number) => void;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    postsApi.comments(postId).then(({ comments }) => {
      setComments(comments);
      setLoading(false);
    });
  }, [postId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const { comment } = await postsApi.addComment(postId, draft.trim());
    const next = [...comments, comment];
    setComments(next);
    onCountChange(next.length);
    setDraft("");
  }

  return (
    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
      {loading && <div className="text-xs text-white/40">Loading comments…</div>}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2 text-sm">
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
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500">
            Post
          </button>
        </form>
      )}
    </div>
  );
}
