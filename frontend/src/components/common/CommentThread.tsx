import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import type { Comment } from "../../types";
import { Avatar } from "./Avatar";
import { CSBadge } from "./CSBadge";
import { EditBox } from "./EditBox";
import { EditedMark } from "./EditedMark";
import { Linkified } from "./Linkified";
import { MentionInput } from "./MentionField";
import { CommentPicture } from "./CommentPicture";
import { CommentPicturePicker } from "./CommentPicturePicker";
import { useAuth } from "../../context/AuthContext";
import { t } from "../../i18n";

const MAX_COMMENT = 1000;

interface Props {
  /** Changes when this is a different thread (another post, another piece): the comments are loaded again. */
  threadKey: string;
  /** One page of the comments: the first, or the ones after `after`. */
  load: (after?: string) => Promise<{ comments: Comment[]; hasMore?: boolean }>;
  /** Post a comment: its words, the address of a picture uploaded for it, if any, and the comment it is a reply to, if it is one. */
  add: (text: string, imageUrl?: string, parent?: string) => Promise<{ comment: Comment }>;
  update: (id: string, text: string) => Promise<{ comment: Comment }>;
  /** Taking the picture off your own comment. Without it there is no Remove picture button. */
  removePicture?: (id: string) => Promise<{ comment: Comment }>;
  /** Taking a comment down. Without it there is no Delete button. */
  remove?: (id: string) => Promise<unknown>;
  /** Whether the viewer may take down other people's comments here (the owner of the page). Their own they may always take down. */
  canModerate?: boolean;
  /** Reporting someone else's comment. Without it there is no Report button. */
  onReport?: (comment: Comment) => void;
  /** Told when a comment is added or removed, as a change to the count (the list may hold only some of the comments). */
  onCountChange: (update: (count: number) => number) => void;
  /** A comment to scroll to and highlight once the list has loaded. */
  highlightId?: string | null;
}

/** Who is being answered: the top-level comment the reply goes under, and the person's name. */
interface ReplyTarget {
  topId: string;
  name: string;
}

/**
 * A list of comments with a box to add one, a page at a time; the same for a post, a portfolio piece and a blog entry. A comment can be
 * answered: the replies sit under it, indented, and a reply to a reply goes under the same comment.
 */
export function CommentThread({ threadKey, load, add, update, removePicture, remove, canModerate = false, onReport, onCountChange, highlightId = null }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The latest functions from the parent, without loading again every time it draws.
  const latest = useRef({ load, add, update, remove, removePicture });
  useEffect(() => {
    latest.current = { load, add, update, remove, removePicture };
  });

  useEffect(() => {
    latest.current
      .load()
      .then(({ comments, hasMore }) => {
        setComments(comments);
        setHasMore(Boolean(hasMore));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("comments.loadFailed")))
      .finally(() => setLoading(false));
  }, [threadKey]);

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
      const next = await latest.current.load(last.id);
      setComments((old) => [...old, ...next.comments.filter((c) => !old.some((o) => o.id === c.id))]);
      setHasMore(Boolean(next.hasMore));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("comments.moreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() && !picture) return;
    setError(null);
    try {
      const { comment } = await (replyTo ? latest.current.add(draft.trim(), picture ?? undefined, replyTo.topId) : latest.current.add(draft.trim(), picture ?? undefined));
      setComments((old) => [...old, comment]);
      onCountChange((n) => n + 1);
      setDraft("");
      setPicture(null);
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("comments.postFailed"));
    }
  }

  function startReply(c: Comment) {
    setReplyTo({ topId: c.parent && comments.some((o) => o.id === c.parent) ? c.parent : c.id, name: c.author.displayName });
    // name the person, unless it is yourself
    setDraft(user?.id === c.author.id ? "" : `@${c.author.username} `);
    inputRef.current?.focus();
  }

  async function saveEdit(id: string, text: string): Promise<string | null> {
    try {
      const { comment } = await latest.current.update(id, text);
      setComments((old) => old.map((c) => (c.id === id ? comment : c)));
      setEditing(null);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : t("common.saveChangeFailed");
    }
  }

  async function takePictureOff(comment: Comment) {
    if (!latest.current.removePicture) return;
    setError(null);
    try {
      const { comment: saved } = await latest.current.removePicture(comment.id);
      setComments((old) => old.map((c) => (c.id === comment.id ? saved : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("comments.pictureOffFailed"));
    }
  }

  async function handleRemove(comment: Comment) {
    if (!latest.current.remove || !window.confirm(t("comments.confirmDelete"))) return;
    setError(null);
    try {
      await latest.current.remove(comment.id);
      // taking a comment down takes its replies with it
      const gone = comments.filter((c) => c.id === comment.id || c.parent === comment.id).length;
      setComments((old) => old.filter((c) => c.id !== comment.id && c.parent !== comment.id));
      if (replyTo?.topId === comment.id) setReplyTo(null);
      onCountChange((n) => Math.max(0, n - gone));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("comments.deleteFailed"));
    }
  }

  const action = "text-xs text-white/60 hover:text-white hover:underline";
  // top-level comments, each with its replies; a reply whose comment isn't here (it was taken down) is shown as a comment of its own
  const here = new Set(comments.map((c) => c.id));
  const tops = comments.filter((c) => !c.parent || !here.has(c.parent));
  const repliesOf = (id: string) => comments.filter((c) => c.parent === id);

  function row(c: Comment, isReply: boolean) {
    const mine = user?.id === c.author.id;
    return (
      <div
        key={c.id}
        id={`comment-${c.id}`}
        aria-current={c.id === highlightId ? "true" : undefined}
        className={`flex gap-2 rounded-md text-sm ${isReply ? "ms-8" : ""} ${c.id === highlightId ? "bg-violet-500/15 p-1.5 ring-1 ring-violet-400/50" : ""}`}
      >
        <Avatar username={c.author.username} displayName={c.author.displayName} avatarUrl={c.author.avatarUrl} size={isReply ? 20 : 24} />
        <div className="min-w-0 flex-1">
          {editing === c.id ? (
            <EditBox text={c.content} maxText={MAX_COMMENT} label={t("comments.editLabel")} rows={2} onSave={({ text }) => saveEdit(c.id, text)} onCancel={() => setEditing(null)} />
          ) : (
            <>
              <span className="font-medium text-white/90">{c.author.displayName}</span>
              <CSBadge verified={c.author.csVerified} size={12} className="ms-0.5" />{" "}
              {c.content && (
                <span dir="auto" className="whitespace-pre-line break-words text-white/70">
                  <Linkified text={c.content} />
                </span>
              )}{" "}
              <EditedMark editedAt={c.editedAt} />
              {user && (
                <button type="button" onClick={() => startReply(c)} aria-label={t("comments.replyAria", { name: c.author.displayName })} className={`ms-2 ${action}`}>
                  {t("comments.reply")}
                </button>
              )}
              {mine && (
                <button type="button" onClick={() => setEditing(c.id)} aria-label={t("comments.editAria", { text: c.content.slice(0, 30) })} className={`ms-2 ${action}`}>
                  {t("common.edit")}
                </button>
              )}
              {remove && (mine || canModerate) && (
                <button type="button" onClick={() => handleRemove(c)} aria-label={mine ? t("comments.deleteMineAria") : t("comments.deleteAria", { name: c.author.displayName })} className={`ms-2 ${action} hover:text-red-400`}>
                  {t("common.delete")}
                </button>
              )}
              {mine && c.imageUrl && removePicture && (
                <button type="button" onClick={() => takePictureOff(c)} aria-label={t("comments.removePictureAria", { text: c.content.slice(0, 30) })} className={`ms-2 ${action}`}>
                  {t("comments.removePicture")}
                </button>
              )}
              {onReport && user && !mine && (
                <button type="button" onClick={() => onReport(c)} aria-label={t("comments.reportAria", { name: c.author.displayName })} className={`ms-2 ${action}`}>
                  {t("common.report")}
                </button>
              )}
              {c.imageUrl && (
                <div>
                  <CommentPicture url={c.imageUrl} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
      {loading && <div className="text-xs text-white/60">{t("comments.loading")}</div>}
      {!loading && comments.length === 0 && !error && <div className="text-xs text-white/60">{t("comments.none")}</div>}
      {tops.map((c) => (
        <div key={c.id} className="space-y-2">
          {row(c, false)}
          {repliesOf(c.id).map((r) => row(r, true))}
        </div>
      ))}
      {hasMore && (
        <button type="button" onClick={showMore} disabled={loadingMore} className="text-xs text-[var(--profile-accent-text,#c4b5fd)] hover:underline disabled:opacity-50">
          {loadingMore ? t("common.loading") : t("comments.showMore")}
        </button>
      )}
      {user && (
        <form onSubmit={handleSubmit} className="space-y-1 pt-1">
          {replyTo && (
            <p className="flex items-center gap-2 text-xs text-white/70">
              <span>{t("comments.replyingTo", { name: replyTo.name })}</span>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null);
                  setDraft("");
                }}
                className={action}
              >
                {t("comments.cancelReply")}
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <MentionInput
              ref={inputRef}
              wrapperClassName="relative min-w-0 flex-1"
              dir="auto"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_COMMENT}
              placeholder={replyTo ? t("comments.replyPlaceholder") : t("comments.placeholder")}
              className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-white placeholder:text-white/55 focus:border-[var(--profile-accent,#8b5cf6)] focus:outline-none"
            />
            <button type="submit" className="rounded-md bg-[var(--profile-accent-fill,#7c3aed)] px-3 py-1 text-xs font-medium text-[var(--profile-on-accent,#ffffff)] hover:opacity-90">
              {t("composer.post")}
            </button>
          </div>
          <CommentPicturePicker url={picture} onChange={setPicture} />
        </form>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
