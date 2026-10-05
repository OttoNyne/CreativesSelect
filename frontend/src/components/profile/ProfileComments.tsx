import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { profilesApi } from "../../api/profiles.api";
import { ApiError } from "../../api/client";
import type { Comment } from "../../types";
import { Avatar } from "../common/Avatar";
import { CSBadge } from "../common/CSBadge";
import { useAuth } from "../../context/AuthContext";
import { EditBox } from "../common/EditBox";
import { EditedMark } from "../common/EditedMark";
import { Linkified } from "../common/Linkified";
import { CommentPicture } from "../common/CommentPicture";
import { CommentPicturePicker } from "../common/CommentPicturePicker";

const MAX_COMMENT = 1000;

export function ProfileComments({ username }: { username: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { hash } = useLocation();

  useEffect(() => {
    profilesApi
      .getComments(username)
      .then(({ comments, hasMore }) => {
        setComments(comments);
        setHasMore(Boolean(hasMore));
      })
      // e.g. a private profile: show the empty state rather than an unhandled rejection
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [username]);

  // Arriving from a notification about a testimonial (…#testimonials): bring the section into view once it has loaded.
  useEffect(() => {
    if (hash === "#testimonials" && !loading) document.getElementById("testimonials")?.scrollIntoView?.({ block: "start" });
  }, [hash, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() && !picture) return;
    setError(null);
    try {
      const { comment } = picture ? await profilesApi.addComment(username, draft.trim(), picture) : await profilesApi.addComment(username, draft.trim());
      setComments((c) => [comment, ...c]);
      setDraft("");
      setPicture(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that comment.");
    }
  }

  async function showMore() {
    const oldest = comments[comments.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await profilesApi.getComments(username, oldest.id);
      setComments((old) => [...old, ...next.comments.filter((c) => !old.some((o) => o.id === c.id))]);
      setHasMore(Boolean(next.hasMore));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load more testimonials.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveEdit(id: string, text: string): Promise<string | null> {
    try {
      const { comment } = await profilesApi.updateComment(id, text);
      setComments((old) => old.map((c) => (c.id === id ? comment : c)));
      setEditing(null);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Couldn't save that change.";
    }
  }

  async function takePictureOff(commentId: string) {
    setError(null);
    try {
      const { comment } = await profilesApi.removeCommentPicture(commentId);
      setComments((list) => list.map((c) => (c.id === commentId ? comment : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't take that picture off.");
    }
  }

  async function handleDelete(commentId: string) {
    setError(null);
    try {
      await profilesApi.deleteComment(commentId);
      setComments((c) => c.filter((comment) => comment.id !== commentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that comment.");
    }
  }

  return (
    <div id="testimonials" className="scroll-mt-20 rounded-xl border border-white/10 bg-black/20 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Testimonials</h2>

      {user && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-1">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_COMMENT}
              placeholder="Leave a comment on this profile…"
              className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none"
            />
            <button type="submit" className="rounded-md bg-[var(--profile-accent-fill)] px-3 py-1.5 text-xs font-medium text-[var(--profile-on-accent)]">
              Post
            </button>
          </div>
          <CommentPicturePicker url={picture} onChange={setPicture} />
        </form>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-3 space-y-3">
        {loading && <p className="text-xs text-white/60">Loading…</p>}
        {!loading && comments.length === 0 && <p className="text-xs text-white/60">No testimonials yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2 text-sm">
            <Link to={`/u/${c.author.username}`}>
              <Avatar username={c.author.username} displayName={c.author.displayName} avatarUrl={c.author.avatarUrl} size={28} />
            </Link>
            <div className="flex-1">
              <Link to={`/u/${c.author.username}`} className="font-medium text-white/90 hover:underline">
                {c.author.displayName}
                <CSBadge verified={c.author.csVerified} size={12} className="ml-1" />
              </Link>
              {editing === c.id ? (
                <EditBox text={c.content} maxText={MAX_COMMENT} label="Edit testimonial" rows={3} onSave={({ text }) => saveEdit(c.id, text)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <p className="whitespace-pre-line break-words text-white/70">
                    {c.content && <Linkified text={c.content} />} <EditedMark editedAt={c.editedAt} />
                  </p>
                  {c.imageUrl && <CommentPicture url={c.imageUrl} />}
                </>
              )}
            </div>
            {user && editing !== c.id && (
              <div className="flex shrink-0 gap-2 self-start text-xs">
                {user.id === c.author.id && (
                  <button onClick={() => setEditing(c.id)} aria-label="Edit your testimonial" className="text-white/60 hover:text-white">
                    Edit
                  </button>
                )}
                {user.id === c.author.id && c.imageUrl && (
                  <button onClick={() => takePictureOff(c.id)} aria-label="Remove the picture from your testimonial" className="text-white/60 hover:text-white">
                    Remove picture
                  </button>
                )}
                {(user.id === c.author.id || user.username === username) && (
                  <button onClick={() => handleDelete(c.id)} aria-label="Delete testimonial" className="text-white/60 hover:text-red-400">
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {hasMore && (
          <button type="button" onClick={showMore} disabled={loadingMore} className="text-xs text-[var(--profile-accent-text)] hover:underline disabled:opacity-50">
            {loadingMore ? "Loading…" : "Show more testimonials"}
          </button>
        )}
      </div>
    </div>
  );
}
