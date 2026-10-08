import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { announceMessagesChanged, MAX_MESSAGE_LENGTH, MESSAGES_CHANGED_EVENT, messagesApi } from "../api/messages.api";
import { ApiError } from "../api/client";
import { liveUpdates, useLiveRefresh } from "../lib/liveUpdates";
import { Avatar } from "../components/common/Avatar";
import { ActivityBadge } from "../components/common/ActivityBadge";
import { EditBox } from "../components/common/EditBox";
import { EditedMark } from "../components/common/EditedMark";
import { locale, t } from "../i18n";
import { tRich } from "../i18n/rich";

// How long after sending a message its sender can still change it (the server enforces this too).
const EDIT_WINDOW_MS = 15 * 60 * 1000;
import type { Conversation, DirectMessage, User } from "../types";

const THREAD_POLL_MS = 5_000;
const LIST_POLL_MS = 15_000;
// While the live connection is up the server says when something arrives, so these timers are only a safety net.
const THREAD_SLOW_POLL_MS = 60_000;
// "Typing…" is sent at most this often while writing, and shown for this long after the last one.
const TYPING_PING_MS = 3_000;
const TYPING_SHOWN_MS = 6_000;
const LIST_SLOW_POLL_MS = 120_000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(locale(), { month: "short", day: "numeric" });
}

function ConversationList({ conversations, active }: { conversations: Conversation[]; active?: string }) {
  if (conversations.length === 0) {
    return (
      <p className="p-4 text-sm text-white/60">
        {tRich("messages.noFriends", {
          find: (c) => (
            <Link to="/search" className="text-violet-400 hover:underline">
              {c}
            </Link>
          ),
        })}
      </p>
    );
  }
  return (
    <ul>
      {conversations.map((c) => (
        <li key={c.user.id}>
          <Link
            to={`/messages/${c.user.username}`}
            aria-current={active === c.user.username ? "page" : undefined}
            className={`flex items-center gap-3 border-b border-white/5 px-3 py-3 hover:bg-white/5 ${
              active === c.user.username ? "bg-white/10" : ""
            }`}
          >
            <Avatar username={c.user.username} displayName={c.user.displayName} avatarUrl={c.user.avatarUrl} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{c.user.displayName}</span>
              <ActivityBadge activity={c.user.activity} className="text-white/60" />
              <span dir="auto" className="block truncate text-xs text-white/60">
                {c.lastMessage ? (c.lastMessage.mine ? t("messages.youPrefix", { body: c.lastMessage.body }) : c.lastMessage.body) : t("messages.noMessages")}
              </span>
            </span>
            {c.unread > 0 && (
              <span
                aria-label={t("messages.unreadAria", { count: c.unread })}
                className="rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold leading-5 text-white"
              >
                {c.unread}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({ username }: { username: string }) {
  const navigate = useNavigate();
  const [other, setOther] = useState<User | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastSeenId = useRef<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPing = useRef(0);

  // Their "typing…" shows while pings keep coming and goes away on its own; a message from them also ends it.
  useEffect(() => {
    const stop = liveUpdates.subscribe("typing", (data) => {
      if (data.with !== username) return;
      setPeerTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setPeerTyping(false), TYPING_SHOWN_MS);
    });
    return () => {
      stop();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [username]);

  const refresh = useCallback(
    async (first = false) => {
      try {
        const res = await messagesApi.thread(username);
        setOther(res.user);
        // Keep any older pages already loaded; the newest page is replaced (it may
        // have gained new messages, or lost ones the sender deleted).
        setMessages((prev) => {
          const firstId = res.messages[0]?.id;
          const older = firstId ? prev.filter((m) => m.id < firstId) : [];
          return [...older, ...res.messages];
        });
        if (first) setHasMore(res.hasMore);
        setState("ready");
        // Opening a thread marks it read, so the badge and list should update; after
        // that only tell them when something new arrived, not on every quiet poll.
        const newest = res.messages.at(-1)?.id ?? null;
        if (newest !== lastSeenId.current && res.messages.at(-1) && !res.messages.at(-1)!.mine) setPeerTyping(false);
        if (first || newest !== lastSeenId.current) announceMessagesChanged();
        lastSeenId.current = newest;
      } catch (err) {
        if (first) {
          setError(err instanceof ApiError ? err.message : t("messages.threadFailed"));
          setState("error");
        }
        // a failed background poll just tries again next time
      }
    },
    [username]
  );

  // The parent keys <Thread> by username, so this runs once per conversation.
  useEffect(() => {
    refresh(true);
  }, [refresh]);
  // A hint names who the message was with, so only this conversation reloads; the timer skips a tab nobody is looking at.
  useLiveRefresh(
    "message",
    (hint) => {
      if (hint ? hint.with !== username : document.hidden) return;
      void refresh();
    },
    THREAD_POLL_MS,
    THREAD_SLOW_POLL_MS
  );

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages]);

  async function loadEarlier() {
    if (!messages.length) return;
    stickToBottom.current = false;
    try {
      const res = await messagesApi.thread(username, messages[0].id);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.hasMore);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("messages.earlierFailed"));
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setActionError(null);
    try {
      const { message } = await messagesApi.send(username, body);
      stickToBottom.current = true;
      setMessages((prev) => [...prev, message]);
      setDraft("");
      announceMessagesChanged();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("messages.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(id: string, body: string): Promise<string | null> {
    try {
      const { message } = await messagesApi.edit(id, body);
      setMessages((prev) => prev.map((m) => (m.id === id ? message : m)));
      setEditing(null);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : t("common.saveChangeFailed");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("messages.confirmDelete"))) return;
    setActionError(null);
    try {
      await messagesApi.remove(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      announceMessagesChanged(); // the list's preview may have been that message
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("messages.deleteFailed"));
    }
  }

  if (state === "loading") return <div className="p-6 text-center text-white/60">{t("common.loading")}</div>;
  if (state === "error") {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={() => navigate("/messages")} className="mt-3 text-sm text-violet-400 hover:underline">
          {t("messages.backToMessages")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <Link to="/messages" aria-label={t("messages.backToConversations")} className="text-white/60 hover:text-white md:hidden">
          <span aria-hidden="true" className="rtl-flip">
            ←
          </span>
        </Link>
        {other && <Avatar username={other.username} displayName={other.displayName} avatarUrl={other.avatarUrl} size={32} />}
        <span className="min-w-0">
          <Link to={`/u/${username}`} className="block font-medium text-white hover:underline">
            {other?.displayName ?? username}
          </Link>
          <ActivityBadge activity={other?.activity} className="text-white/60" />
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {hasMore && (
          <button onClick={loadEarlier} className="mx-auto block text-xs text-violet-400 hover:underline">
            {t("messages.loadEarlier")}
          </button>
        )}
        {messages.length === 0 && <p className="py-8 text-center text-sm text-white/60">{t("messages.empty")}</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              dir="auto"
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                m.mine ? "bg-violet-600 text-white" : "bg-white/10 text-white"
              }`}
            >
              {editing === m.id ? (
                <EditBox text={m.body} maxText={MAX_MESSAGE_LENGTH} label={t("messages.editLabel")} rows={2} onSave={({ text }) => saveEdit(m.id, text)} onCancel={() => setEditing(null)} />
              ) : (
                m.body
              )}
              <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-white/60">
                <span>{timeLabel(m.createdAt)}</span>
                <EditedMark editedAt={m.editedAt} className="text-[10px] text-white/60" />
                {m.mine && m.readAt && <span>{t("messages.seen")}</span>}
                {m.mine && editing !== m.id && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS && (
                  <button onClick={() => setEditing(m.id)} aria-label={t("messages.editLabel")} className="hover:text-white">
                    {t("common.edit")}
                  </button>
                )}
                {m.mine && (
                  <button onClick={() => handleDelete(m.id)} aria-label={t("messages.deleteLabel")} className="hover:text-white">
                    {t("common.delete")}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {actionError && <p className="px-3 text-xs text-red-400">{actionError}</p>}
      <p role="status" aria-live="polite" className="min-h-[1.25rem] px-3 text-xs italic text-white/60">
        {peerTyping ? t("messages.typing", { name: other?.displayName ?? username }) : ""}
      </p>
      <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-white/10 p-3">
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            // tell them, at most every few seconds, that something is being written (the server drops it if either of you has this off)
            const now = Date.now();
            if (e.target.value.trim() && now - lastPing.current >= TYPING_PING_MS) {
              lastPing.current = now;
              messagesApi.typing(username).catch(() => {});
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          dir="auto"
          placeholder={t("messages.placeholder")}
          aria-label={t("messages.inputLabel")}
          className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? t("common.sending") : t("messages.send")}
        </button>
      </form>
    </div>
  );
}

export function MessagesPage() {
  const { username } = useParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listState, setListState] = useState<"loading" | "error" | "ready">("loading");

  const loadList = useCallback(async (first: boolean) => {
    try {
      const { conversations } = await messagesApi.conversations();
      setConversations(conversations);
      setListState("ready");
    } catch {
      if (first) setListState("error");
    }
  }, []);

  useEffect(() => {
    void loadList(true);
    // refresh right away when a thread is opened or a message sent
    const onChange = () => void loadList(false);
    window.addEventListener(MESSAGES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(MESSAGES_CHANGED_EVENT, onChange);
  }, [loadList]);
  // The list changes whenever any message does; the timer skips a tab nobody is looking at.
  useLiveRefresh(
    "message",
    (hint) => {
      if (!hint && document.hidden) return;
      void loadList(false);
    },
    LIST_POLL_MS,
    LIST_SLOW_POLL_MS
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-3 text-lg font-semibold text-white">{t("messages.title")}</h1>
      <div className="flex h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-white/10 bg-black/20">
        <aside className={`${username ? "hidden md:block" : "block"} w-full overflow-y-auto border-white/10 md:w-72 md:border-e`}>
          {listState === "loading" && <p className="p-4 text-sm text-white/60">{t("common.loading")}</p>}
          {listState === "error" && <p className="p-4 text-sm text-red-400">{t("messages.listFailed")}</p>}
          {listState === "ready" && <ConversationList conversations={conversations} active={username} />}
        </aside>
        <section className={`${username ? "block" : "hidden md:block"} min-w-0 flex-1`}>
          {username ? (
            <Thread key={username} username={username} />
          ) : (
            <p className="p-8 text-center text-sm text-white/60">{t("messages.choose")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
