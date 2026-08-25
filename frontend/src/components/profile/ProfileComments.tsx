import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { profilesApi } from "../../api/profiles.api";
import type { Comment } from "../../types";
import { Avatar } from "../common/Avatar";
import { useAuth } from "../../context/AuthContext";

export function ProfileComments({ username }: { username: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    profilesApi.getComments(username).then(({ comments }) => {
      setComments(comments);
      setLoading(false);
    });
  }, [username]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const { comment } = await profilesApi.addComment(username, draft.trim());
    setComments((c) => [comment, ...c]);
    setDraft("");
  }

  async function handleDelete(commentId: string) {
    await profilesApi.deleteComment(commentId);
    setComments((c) => c.filter((comment) => comment.id !== commentId));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Testimonials</h2>

      {user && (
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Leave a comment on this profile…"
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--profile-accent)] focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-[var(--profile-accent)] px-3 py-1.5 text-xs font-medium text-white">
            Post
          </button>
        </form>
      )}

      <div className="mt-3 space-y-3">
        {loading && <p className="text-xs text-white/40">Loading…</p>}
        {!loading && comments.length === 0 && <p className="text-xs text-white/40">No testimonials yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2 text-sm">
            <Link to={`/u/${c.author.username}`}>
              <Avatar username={c.author.username} displayName={c.author.displayName} avatarUrl={c.author.avatarUrl} size={28} />
            </Link>
            <div className="flex-1">
              <Link to={`/u/${c.author.username}`} className="font-medium text-white/90 hover:underline">
                {c.author.displayName}
              </Link>
              <p className="text-white/70">{c.content}</p>
            </div>
            {user && (user.id === c.author.id || user.username === username) && (
              <button onClick={() => handleDelete(c.id)} className="self-start text-xs text-white/30 hover:text-red-400">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
