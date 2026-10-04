import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { moderationApi } from "../../api/moderation.api";
import { groupsApi, MAX_REPLY_BODY, MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from "../../api/groups.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import { formatDay } from "../../lib/when";
import type { GroupReply, GroupTopic } from "../../types";

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";
const small = "rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50";
const problemOf = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** A group's board: lasting topics with replies, for its members. Authors and admins can remove things; admins can pin topics. */
export function GroupBoard({ groupId, canModerate }: { groupId: string; canModerate: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [topics, setTopics] = useState<GroupTopic[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setState("loading");
    try {
      const res = await groupsApi.topics(groupId);
      setTopics(res.topics);
      setPage(1);
      setHasMore(res.hasMore);
      setState("ready");
    } catch (err) {
      setError(problemOf(err, "Couldn't load the board."));
      setState("error");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function showMore() {
    setBusy(true);
    try {
      const res = await groupsApi.topics(groupId, page + 1);
      setTopics((old) => [...old, ...res.topics.filter((t) => !old.some((o) => o.id === t.id))]);
      setPage(page + 1);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(problemOf(err, "Couldn't load more topics."));
    } finally {
      setBusy(false);
    }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) return setFormError("Give your topic a title");
    if (!body.trim()) return setFormError("Write something to start the topic");
    setBusy(true);
    setFormError(null);
    try {
      const { topic } = await groupsApi.createTopic(groupId, { title, body });
      setTopics((old) => [topic, ...old.filter((t) => t.pinned), ...old.filter((t) => !t.pinned)].filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i));
      setTitle("");
      setBody("");
      setComposing(false);
      setOpen(topic.id);
    } catch (err) {
      setFormError(problemOf(err, "Couldn't start that topic."));
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return (
      <TopicView
        groupId={groupId}
        topicId={open}
        canModerate={canModerate}
        onBack={() => {
          setOpen(null);
          load(); // reply counts and the order may have changed
        }}
      />
    );
  }

  return (
    <section aria-label="Board" className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Board</h2>
        {!composing && (
          <button type="button" onClick={() => setComposing(true)} className={small}>
            New topic
          </button>
        )}
      </div>

      {composing && (
        <form onSubmit={start} className="mt-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TOPIC_TITLE} placeholder="Topic title" aria-label="Topic title" className={field} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_TOPIC_BODY} rows={4} placeholder="What do you want to talk about?" aria-label="Topic text" className={field} />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {busy ? "Posting…" : "Start topic"}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setFormError(null);
              }}
              className="text-sm text-white/70 hover:underline"
            >
              Cancel
            </button>
            <span className="ml-auto text-xs text-white/60" aria-live="polite">
              {body.length} / {MAX_TOPIC_BODY}
            </span>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-red-400">
              {formError}
            </p>
          )}
        </form>
      )}

      {state === "loading" && <p className="mt-3 text-sm text-white/60">Loading…</p>}
      {state === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {state === "ready" && topics.length === 0 && <p className="mt-3 text-sm text-white/60">No topics yet. Start the first one.</p>}
      <ul className="mt-3 space-y-2">
        {topics.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => setOpen(t.id)} className="block w-full rounded-lg border border-white/10 p-3 text-left hover:bg-white/[0.05]">
              <span className="flex items-center gap-2">
                {t.pinned && <span className="rounded-full bg-violet-500/25 px-2 py-0.5 text-[11px] text-violet-200">Pinned</span>}
                <span className="font-medium text-white">{t.title}</span>
              </span>
              <span className="mt-0.5 block text-xs text-white/60">
                {t.author?.displayName ?? "Someone"} · {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"} · active {formatDay(t.lastActivityAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" onClick={showMore} disabled={busy} className="mt-3 w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          Show more topics
        </button>
      )}
    </section>
  );
}

function TopicView({ groupId, topicId, canModerate, onBack }: { groupId: string; topicId: string; canModerate: boolean; onBack: () => void }) {
  const [topic, setTopic] = useState<GroupTopic | null>(null);
  const [replies, setReplies] = useState<GroupReply[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    groupsApi
      .topic(groupId, topicId)
      .then((res) => {
        if (cancelled) return;
        setTopic(res.topic);
        setReplies(res.replies);
        setHasMore(res.hasMore);
        setState("ready");
      })
      .catch((err) => !cancelled && setState(err instanceof ApiError && err.status === 404 ? "missing" : "error"));
    return () => {
      cancelled = true;
    };
  }, [groupId, topicId]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { reply } = await groupsApi.reply(groupId, topicId, draft);
      setReplies((old) => [...old, reply]);
      setTopic((t) => (t ? { ...t, replyCount: t.replyCount + 1 } : t));
      setDraft("");
    } catch (err) {
      setError(problemOf(err, "Couldn't post that reply."));
    } finally {
      setBusy(false);
    }
  }

  async function moreReplies() {
    setBusy(true);
    try {
      const res = await groupsApi.topic(groupId, topicId, page + 1);
      setReplies((old) => [...old, ...res.replies.filter((r) => !old.some((o) => o.id === r.id))]);
      setPage(page + 1);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(problemOf(err, "Couldn't load more replies."));
    } finally {
      setBusy(false);
    }
  }

  async function removeTopic() {
    if (!topic || !window.confirm(`Delete "${topic.title}" and all its replies?`)) return;
    try {
      await groupsApi.deleteTopic(groupId, topicId);
      onBack();
    } catch (err) {
      setError(problemOf(err, "Couldn't delete that topic."));
    }
  }

  async function removeReply(reply: GroupReply) {
    if (!window.confirm("Delete this reply?")) return;
    try {
      await groupsApi.deleteReply(groupId, topicId, reply.id);
      setReplies((old) => old.filter((r) => r.id !== reply.id));
      setTopic((t) => (t ? { ...t, replyCount: Math.max(0, t.replyCount - 1) } : t));
    } catch (err) {
      setError(problemOf(err, "Couldn't delete that reply."));
    }
  }

  async function report(kind: "groupTopic" | "groupReply", id: string, what: string) {
    const reason = prompt(`What's the issue with this ${what}?`);
    if (!reason) return;
    try {
      await moderationApi.report(kind, id, reason);
      alert("Report submitted. Thanks for helping keep this space safe.");
    } catch (err) {
      alert(problemOf(err, "Couldn't submit that report."));
    }
  }

  async function togglePin() {
    if (!topic) return;
    try {
      const { topic: updated } = await groupsApi.pinTopic(groupId, topicId, !topic.pinned);
      setTopic((t) => (t ? { ...t, pinned: updated.pinned } : t));
    } catch (err) {
      setError(problemOf(err, "Couldn't change that."));
    }
  }

  return (
    <section aria-label="Topic" className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <button type="button" onClick={onBack} className="text-sm text-violet-400 hover:underline">
        ← Back to the board
      </button>
      {state === "loading" && <p className="mt-3 text-sm text-white/60">Loading…</p>}
      {state === "missing" && (
        <p role="alert" className="mt-3 text-sm text-white/70">
          This topic isn&apos;t available. It may have been deleted.
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          Couldn&apos;t load this topic. Please try again.
        </p>
      )}
      {state === "ready" && topic && (
        <>
          <h2 className="mt-3 text-lg font-semibold text-white">
            {topic.pinned && <span className="mr-2 rounded-full bg-violet-500/25 px-2 py-0.5 align-middle text-[11px] font-normal text-violet-200">Pinned</span>}
            {topic.title}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
            {topic.author && <Avatar username={topic.author.username} displayName={topic.author.displayName} avatarUrl={topic.author.avatarUrl} size={20} />}
            {topic.author ? (
              <Link to={`/u/${topic.author.username}`} className="hover:underline">
                {topic.author.displayName}
              </Link>
            ) : (
              <span>Someone</span>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={topic.createdAt}>{formatDay(topic.createdAt)}</time>
          </div>
          <p className="mt-3 whitespace-pre-line break-words text-sm text-white/90">{topic.body}</p>
          <div className="mt-3 flex gap-2">
            {canModerate && (
              <button type="button" onClick={togglePin} className={small}>
                {topic.pinned ? "Unpin topic" : "Pin topic"}
              </button>
            )}
            {!topic.mine && (
              <button type="button" onClick={() => report("groupTopic", topic.id, "topic")} className={small}>
                Report topic
              </button>
            )}
            {(topic.mine || canModerate) && (
              <button type="button" onClick={removeTopic} className="rounded-md border border-red-400/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">
                Delete topic
              </button>
            )}
          </div>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-white/60">
            {topic.replyCount} {topic.replyCount === 1 ? "reply" : "replies"}
          </h3>
          <ul className="mt-2 space-y-2">
            {replies.map((r) => (
              <li key={r.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  {r.author && <Avatar username={r.author.username} displayName={r.author.displayName} avatarUrl={r.author.avatarUrl} size={20} />}
                  <span className="font-medium text-white/80">{r.mine ? "You" : (r.author?.displayName ?? "Someone")}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={r.createdAt}>{formatDay(r.createdAt)}</time>
                  <span className="ml-auto flex gap-3">
                    {!r.mine && (
                      <button type="button" onClick={() => report("groupReply", r.id, "reply")} aria-label={`Report reply by ${r.author?.displayName ?? "someone"}`} className="text-white/60 hover:text-white">
                        Report
                      </button>
                    )}
                    {(r.mine || canModerate) && (
                      <button type="button" onClick={() => removeReply(r)} aria-label={`Delete reply by ${r.mine ? "you" : (r.author?.displayName ?? "someone")}`} className="text-white/60 hover:text-red-400">
                        Delete
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-white/90">{r.body}</p>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button type="button" onClick={moreReplies} disabled={busy} className="mt-3 w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
              Show more replies
            </button>
          )}

          <form onSubmit={sendReply} className="mt-4 space-y-2">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_REPLY_BODY} rows={3} placeholder="Write a reply…" aria-label="Reply" className={field} />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy || !draft.trim()} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                {busy ? "Posting…" : "Reply"}
              </button>
              <span className="ml-auto text-xs text-white/60" aria-live="polite">
                {draft.length} / {MAX_REPLY_BODY}
              </span>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
