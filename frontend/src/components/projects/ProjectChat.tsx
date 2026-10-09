import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { projectsApi } from "../../api/projects.api";
import { liveUpdates } from "../../lib/liveUpdates";
import { shortAgo } from "../../lib/when";
import type { ProjectMessage } from "../../types";
import { Avatar } from "../common/Avatar";
import { CommentPicture } from "../common/CommentPicture";
import { CommentPicturePicker } from "../common/CommentPicturePicker";
import { Linkified } from "../common/Linkified";
import { ReportButton } from "../common/ReportButton";
import { t } from "../../i18n";

const POLL_MS = 30_000;
const SLOW_POLL_MS = 300_000;

/**
 * A room's chat: the newest messages (older ones on request), kept up to date by the server's hints (with a slow check as a safety net),
 * and a box to write in. Writing is switched off in an archived room. A message can be deleted by its writer or the room's owner, and
 * reported by anyone else.
 */
export function ProjectChat({ projectId, archived, isOwner }: { projectId: string; archived: boolean; isOwner: boolean }) {
  const [messages, setMessages] = useState<ProjectMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const newest = useRef<string | null>(null);

  const refresh = useCallback(
    async (first = false) => {
      try {
        const r = await projectsApi.messages(projectId);
        setMessages((old) => {
          const firstId = r.messages[0]?.id;
          const older = firstId && old ? old.filter((m) => m.id < firstId) : [];
          return [...older, ...r.messages];
        });
        if (first) setHasMore(r.hasMore);
      } catch (err) {
        if (first) {
          setMessages([]);
          setProblem(err instanceof ApiError ? err.message : t("projects.loadFailed"));
        }
      }
    },
    [projectId]
  );

  useEffect(() => {
    void refresh(true);
    const stop = liveUpdates.subscribe("project", (data) => {
      if (data.id === projectId) void refresh();
    });
    const timer = setInterval(() => void refresh(), liveUpdates.isConnected() ? SLOW_POLL_MS : POLL_MS);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [projectId, refresh]);

  // stay at the bottom as new messages arrive, unless the reader has scrolled up
  useEffect(() => {
    const last = messages?.at(-1)?.id ?? null;
    if (last !== newest.current && stick.current) endRef.current?.scrollIntoView?.({ block: "end" });
    newest.current = last;
  }, [messages]);

  async function earlier() {
    const first = messages?.[0];
    if (!first) return;
    stick.current = false;
    try {
      const r = await projectsApi.messages(projectId, first.id);
      setMessages((old) => [...r.messages, ...(old ?? [])]);
      setHasMore(r.hasMore);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("projects.failed"));
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending || (!draft.trim() && !picture)) return;
    setSending(true);
    setProblem(null);
    try {
      const { message } = await projectsApi.send(projectId, { ...(draft.trim() ? { content: draft.trim() } : {}), ...(picture ? { imageUrl: picture } : {}) });
      stick.current = true;
      setMessages((old) => [...(old ?? []).filter((m) => m.id !== message.id), message]);
      setDraft("");
      setPicture(null);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("projects.failed"));
    } finally {
      setSending(false);
    }
  }

  async function remove(message: ProjectMessage) {
    if (!window.confirm(t("projects.confirmDeleteMessage"))) return;
    setProblem(null);
    try {
      await projectsApi.deleteMessage(projectId, message.id);
      setMessages((old) => (old ?? []).filter((m) => m.id !== message.id));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("projects.failed"));
    }
  }

  const action = "text-xs text-white/60 hover:text-white hover:underline";
  return (
    <section aria-label={t("projects.chat")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium text-white">{t("projects.chat")}</h2>
      {hasMore && (
        <button type="button" onClick={earlier} className="text-xs text-violet-300 hover:underline">
          {t("projects.earlier")}
        </button>
      )}
      {messages === null && <p className="text-xs text-white/60">{t("common.loading")}</p>}
      {messages?.length === 0 && !problem && <p className="text-xs text-white/60">{t("projects.noMessages")}</p>}
      <ul onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="max-h-[28rem] space-y-3 overflow-y-auto pe-1">
        {messages?.map((m) => (
          <li key={m.id} id={`message-${m.id}`} className="flex gap-2 text-sm">
            {m.author ? (
              <Link to={`/u/${m.author.username}`} className="shrink-0">
                <Avatar username={m.author.username} displayName={m.author.displayName} avatarUrl={m.author.avatarUrl} size={28} />
              </Link>
            ) : (
              <span className="h-7 w-7 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/60">
                <span className="font-medium text-white/90">{m.author?.displayName}</span> · {shortAgo(m.createdAt)}
              </p>
              {m.content && (
                <p dir="auto" className="whitespace-pre-line break-words text-white/90">
                  <Linkified text={m.content} />
                </p>
              )}
              {m.imageUrl && <CommentPicture url={m.imageUrl} />}
              <div className="flex flex-wrap items-center gap-x-3">
                {(m.mine || isOwner) && (
                  <button type="button" onClick={() => remove(m)} aria-label={t("projects.deleteMessage")} className={`${action} hover:text-red-400`}>
                    {t("common.delete")}
                  </button>
                )}
                {!m.mine && <ReportButton targetType="projectMessage" targetId={m.id} label={t("projects.reportMessage", { name: m.author?.displayName ?? "" })} className="text-xs text-white/60" />}
              </div>
            </div>
          </li>
        ))}
        <div ref={endRef} />
      </ul>
      {!archived && (
        <form onSubmit={send} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(e);
            }}
            maxLength={1000}
            rows={2}
            dir="auto"
            aria-label={t("projects.messageLabel")}
            placeholder={t("projects.messagePlaceholder")}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <CommentPicturePicker url={picture} onChange={setPicture} disabled={sending} />
          <button type="submit" disabled={sending || (!draft.trim() && !picture)} className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {sending ? t("projects.sending") : t("projects.send")}
          </button>
        </form>
      )}
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}
