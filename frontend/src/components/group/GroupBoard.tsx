import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { moderationApi } from "../../api/moderation.api";
import { groupsApi, MAX_REPLY_BODY, MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from "../../api/groups.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import { EditBox } from "../common/EditBox";
import { EditedMark } from "../common/EditedMark";
import { formatDay } from "../../lib/when";
import type { GroupReply, GroupTopic } from "../../types";
import { t } from "../../i18n";
import { Linkified } from "../common/Linkified";
import { MentionTextarea } from "../common/MentionField";

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
      setError(problemOf(err, t("groups.couldntLoadTheBoard")));
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
      setError(problemOf(err, t("groups.couldntLoadMoreTopics")));
    } finally {
      setBusy(false);
    }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) return setFormError(t("groups.giveYourTopicA"));
    if (!body.trim()) return setFormError(t("groups.writeSomethingToStart"));
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
      setFormError(problemOf(err, t("groups.couldntStartThatTopic")));
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
    <section aria-label={t("groups.board")} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{t("groups.board")}</h2>
        {!composing && (
          <button type="button" onClick={() => setComposing(true)} className={small}>
            {t("groups.newTopic")}
          </button>
        )}
      </div>

      {composing && (
        <form onSubmit={start} className="mt-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TOPIC_TITLE} placeholder={t("groups.topicTitle")} aria-label={t("groups.topicTitle")} className={field} />
          <MentionTextarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_TOPIC_BODY} rows={4} placeholder={t("groups.whatDoYouWant")} aria-label={t("groups.topicText")} className={field} />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {busy ? t("composer.posting") : t("groups.startTopic")}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setFormError(null);
              }}
              className="text-sm text-white/70 hover:underline"
            >
              {t("common.cancel")}
            </button>
            <span className="ms-auto text-xs text-white/60" aria-live="polite">
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

      {state === "loading" && <p className="mt-3 text-sm text-white/60">{t("common.loading")}</p>}
      {state === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {state === "ready" && topics.length === 0 && <p className="mt-3 text-sm text-white/60">{t("groups.noTopicsYetStart")}</p>}
      <ul className="mt-3 space-y-2">
        {topics.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => setOpen(item.id)} className="block w-full rounded-lg border border-white/10 p-3 text-start hover:bg-white/[0.05]">
              <span className="flex items-center gap-2">
                {item.pinned && <span className="rounded-full bg-violet-500/25 px-2 py-0.5 text-[11px] text-violet-200">{t("groups.pinned")}</span>}
                <span className="font-medium text-white" dir="auto">{item.title}</span>
              </span>
              <span className="mt-0.5 block text-xs text-white/60">
                {t("groups.topicMeta", { author: item.author?.displayName ?? t("common.someone"), replies: t("groups.replyCount", { n: item.replyCount }), day: formatDay(item.lastActivityAt) })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" onClick={showMore} disabled={busy} className="mt-3 w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {t("groups.showMoreTopics")}
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
  const [editingTopic, setEditingTopic] = useState(false);
  const [editingReply, setEditingReply] = useState<string | null>(null);

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
      setError(problemOf(err, t("groups.couldntPostThatReply")));
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
      setError(problemOf(err, t("groups.couldntLoadMoreReplies")));
    } finally {
      setBusy(false);
    }
  }

  async function removeTopic() {
    if (!topic || !window.confirm(t("groups.deleteTopicConfirm", { title: topic.title }))) return;
    try {
      await groupsApi.deleteTopic(groupId, topicId);
      onBack();
    } catch (err) {
      setError(problemOf(err, t("groups.couldntDeleteThatTopic")));
    }
  }

  async function removeReply(reply: GroupReply) {
    if (!window.confirm(t("groups.deleteThisReply"))) return;
    try {
      await groupsApi.deleteReply(groupId, topicId, reply.id);
      setReplies((old) => old.filter((r) => r.id !== reply.id));
      setTopic((t) => (t ? { ...t, replyCount: Math.max(0, t.replyCount - 1) } : t));
    } catch (err) {
      setError(problemOf(err, t("groups.couldntDeleteThatReply")));
    }
  }

  async function report(kind: "groupTopic" | "groupReply", id: string, what: string) {
    const reason = prompt(t(what === "topic" ? "groups.reportTopicPrompt" : "groups.reportReplyPrompt"));
    if (!reason) return;
    try {
      await moderationApi.report(kind, id, reason);
      alert(t("profile.reportSubmittedThanksFor"));
    } catch (err) {
      alert(problemOf(err, t("profile.couldntSubmitThatReport")));
    }
  }

  async function saveTopic(value: { text: string; title?: string }): Promise<string | null> {
    try {
      const { topic: updated } = await groupsApi.updateTopic(groupId, topicId, { title: value.title, body: value.text });
      setTopic((t) => (t ? { ...t, title: updated.title, body: updated.body, editedAt: updated.editedAt } : t));
      setEditingTopic(false);
      return null;
    } catch (err) {
      return problemOf(err, t("common.saveChangeFailed"));
    }
  }

  async function saveReply(reply: GroupReply, text: string): Promise<string | null> {
    try {
      const { reply: updated } = await groupsApi.updateReply(groupId, topicId, reply.id, text);
      setReplies((old) => old.map((r) => (r.id === reply.id ? { ...r, body: updated.body, editedAt: updated.editedAt } : r)));
      setEditingReply(null);
      return null;
    } catch (err) {
      return problemOf(err, t("common.saveChangeFailed"));
    }
  }

  async function togglePin() {
    if (!topic) return;
    try {
      const { topic: updated } = await groupsApi.pinTopic(groupId, topicId, !topic.pinned);
      setTopic((t) => (t ? { ...t, pinned: updated.pinned } : t));
    } catch (err) {
      setError(problemOf(err, t("groups.couldntChangeThat")));
    }
  }

  return (
    <section aria-label={t("groups.topic")} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <button type="button" onClick={onBack} className="text-sm text-violet-400 hover:underline">
        {t("groups.backToTheBoard")}
      </button>
      {state === "loading" && <p className="mt-3 text-sm text-white/60">{t("common.loading")}</p>}
      {state === "missing" && (
        <p role="alert" className="mt-3 text-sm text-white/70">
          {t("groups.thisTopicIsntAvailable")}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {t("groups.couldntLoadThisTopic")}
        </p>
      )}
      {state === "ready" && topic && (
        <>
          <h2 className="mt-3 text-lg font-semibold text-white">
            {topic.pinned && <span className="me-2 rounded-full bg-violet-500/25 px-2 py-0.5 align-middle text-[11px] font-normal text-violet-200">{t("groups.pinned")}</span>}
            {topic.title} <EditedMark editedAt={topic.editedAt} />
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
            {topic.author && <Avatar username={topic.author.username} displayName={topic.author.displayName} avatarUrl={topic.author.avatarUrl} size={20} />}
            {topic.author ? (
              <Link to={`/u/${topic.author.username}`} className="hover:underline">
                {topic.author.displayName}
              </Link>
            ) : (
              <span>{t("common.someone")}</span>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={topic.createdAt}>{formatDay(topic.createdAt)}</time>
          </div>
          {editingTopic ? (
            <EditBox title={topic.title} maxTitle={MAX_TOPIC_TITLE} text={topic.body} maxText={MAX_TOPIC_BODY} label={t("groups.editTopic")} onSave={saveTopic} onCancel={() => setEditingTopic(false)} />
          ) : (
            <p dir="auto" className="mt-3 whitespace-pre-line break-words text-sm text-white/90"><Linkified text={topic.body} /></p>
          )}
          <div className="mt-3 flex gap-2">
            {topic.mine && !editingTopic && (
              <button type="button" onClick={() => setEditingTopic(true)} className={small}>
                {t("groups.editTopic")}
              </button>
            )}
            {canModerate && (
              <button type="button" onClick={togglePin} className={small}>
                {topic.pinned ? t("groups.unpinTopic") : t("groups.pinTopic")}
              </button>
            )}
            {!topic.mine && (
              <button type="button" onClick={() => report("groupTopic", topic.id, "topic")} className={small}>
                {t("groups.reportTopic")}
              </button>
            )}
            {(topic.mine || canModerate) && (
              <button type="button" onClick={removeTopic} className="rounded-md border border-red-400/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">
                {t("groups.deleteTopic")}
              </button>
            )}
          </div>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-white/60">
            {topic.replyCount} {topic.replyCount === 1 ? t("groups.reply") : t("groups.replies")}
          </h3>
          <ul className="mt-2 space-y-2">
            {replies.map((r) => (
              <li key={r.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  {r.author && <Avatar username={r.author.username} displayName={r.author.displayName} avatarUrl={r.author.avatarUrl} size={20} />}
                  <span className="font-medium text-white/80">{r.mine ? t("groups.you") : (r.author?.displayName ?? t("common.someone"))}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={r.createdAt}>{formatDay(r.createdAt)}</time>
                  <span className="ms-auto flex gap-3">
                    {r.mine && editingReply !== r.id && (
                      <button type="button" onClick={() => setEditingReply(r.id)} aria-label={t("groups.editYourReply")} className="text-white/60 hover:text-white">
                        {t("common.edit")}
                      </button>
                    )}
                    {!r.mine && (
                      <button type="button" onClick={() => report("groupReply", r.id, "reply")} aria-label={t("groups.reportReplyAria", { name: r.author?.displayName ?? t("common.someone") })} className="text-white/60 hover:text-white">
                        {t("common.report")}
                      </button>
                    )}
                    {(r.mine || canModerate) && (
                      <button type="button" onClick={() => removeReply(r)} aria-label={r.mine ? t("groups.deleteMyReplyAria") : t("groups.deleteReplyAria", { name: r.author?.displayName ?? t("common.someone") })} className="text-white/60 hover:text-red-400">
                        {t("common.delete")}
                      </button>
                    )}
                  </span>
                </div>
                {editingReply === r.id ? (
                  <EditBox text={r.body} maxText={MAX_REPLY_BODY} label={t("groups.editReply")} rows={3} onSave={({ text }) => saveReply(r, text)} onCancel={() => setEditingReply(null)} />
                ) : (
                  <p dir="auto" className="mt-1 whitespace-pre-line break-words text-sm text-white/90">
                    <Linkified text={r.body} /> <EditedMark editedAt={r.editedAt} />
                  </p>
                )}
              </li>
            ))}
          </ul>
          {hasMore && (
            <button type="button" onClick={moreReplies} disabled={busy} className="mt-3 w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
              {t("groups.showMoreReplies")}
            </button>
          )}

          <form onSubmit={sendReply} className="mt-4 space-y-2">
            <MentionTextarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_REPLY_BODY} rows={3} placeholder={t("groups.writeAReply")} aria-label={t("groups.reply2")} className={field} />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy || !draft.trim()} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                {busy ? t("composer.posting") : t("groups.reply2")}
              </button>
              <span className="ms-auto text-xs text-white/60" aria-live="polite">
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
