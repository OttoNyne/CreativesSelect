import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { announceMessagesChanged, MAX_MESSAGE_LENGTH, MESSAGES_CHANGED_EVENT, messagesApi } from "../api/messages.api";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import type { Conversation, DirectMessage, User } from "../types";

const THREAD_POLL_MS = 5_000;
const LIST_POLL_MS = 15_000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ConversationList({ conversations, active }: { conversations: Conversation[]; active?: string }) {
  if (conversations.length === 0) {
    return (
      <p className="p-4 text-sm text-white/40">
        You can message your friends.{" "}
        <Link to="/search" className="text-violet-400 hover:underline">
          Find creatives
        </Link>{" "}
        to add.
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
              <span className="block truncate text-xs text-white/40">
                {c.lastMessage ? `${c.lastMessage.mine ? "You: " : ""}${c.lastMessage.body}` : "No messages yet"}
              </span>
            </span>
            {c.unread > 0 && (
              <span
                aria-label={`${c.unread} unread`}
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastSeenId = useRef<string | null>(null);

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
        if (first || newest !== lastSeenId.current) announceMessagesChanged();
        lastSeenId.current = newest;
      } catch (err) {
        if (first) {
          setError(err instanceof ApiError ? err.message : "Couldn't load this conversation.");
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
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

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
      setActionError(err instanceof ApiError ? err.message : "Couldn't load earlier messages.");
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
      setActionError(err instanceof ApiError ? err.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this message for both of you?")) return;
    setActionError(null);
    try {
      await messagesApi.remove(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      announceMessagesChanged(); // the list's preview may have been that message
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't delete that message.");
    }
  }

  if (state === "loading") return <div className="p-6 text-center text-white/40">Loading…</div>;
  if (state === "error") {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={() => navigate("/messages")} className="mt-3 text-sm text-violet-400 hover:underline">
          Back to messages
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <Link to="/messages" aria-label="Back to conversations" className="text-white/60 hover:text-white md:hidden">
          ←
        </Link>
        {other && <Avatar username={other.username} displayName={other.displayName} avatarUrl={other.avatarUrl} size={32} />}
        <Link to={`/u/${username}`} className="font-medium text-white hover:underline">
          {other?.displayName ?? username}
        </Link>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {hasMore && (
          <button onClick={loadEarlier} className="mx-auto block text-xs text-violet-400 hover:underline">
            Load earlier messages
          </button>
        )}
        {messages.length === 0 && <p className="py-8 text-center text-sm text-white/40">No messages yet — say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                m.mine ? "bg-violet-600 text-white" : "bg-white/10 text-white"
              }`}
            >
              {m.body}
              <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-white/50">
                <span>{timeLabel(m.createdAt)}</span>
                {m.mine && m.readAt && <span>Seen</span>}
                {m.mine && (
                  <button onClick={() => handleDelete(m.id)} aria-label="Delete message" className="hover:text-white">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {actionError && <p className="px-3 text-xs text-red-400">{actionError}</p>}
      <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-white/10 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          placeholder="Write a message…"
          aria-label="Message"
          className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

export function MessagesPage() {
  const { username } = useParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listState, setListState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load(first: boolean) {
      try {
        const { conversations } = await messagesApi.conversations();
        if (!cancelled) {
          setConversations(conversations);
          setListState("ready");
        }
      } catch {
        if (!cancelled && first) setListState("error");
      }
    }
    load(true);
    const timer = setInterval(() => {
      if (!document.hidden) load(false);
    }, LIST_POLL_MS);
    // refresh right away when a thread is opened or a message sent
    const onChange = () => load(false);
    window.addEventListener(MESSAGES_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, onChange);
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-3 text-lg font-semibold text-white">Messages</h1>
      <div className="flex h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-white/10 bg-black/20">
        <aside className={`${username ? "hidden md:block" : "block"} w-full overflow-y-auto border-white/10 md:w-72 md:border-r`}>
          {listState === "loading" && <p className="p-4 text-sm text-white/40">Loading…</p>}
          {listState === "error" && <p className="p-4 text-sm text-red-400">Couldn&apos;t load your conversations.</p>}
          {listState === "ready" && <ConversationList conversations={conversations} active={username} />}
        </aside>
        <section className={`${username ? "block" : "hidden md:block"} min-w-0 flex-1`}>
          {username ? (
            <Thread key={username} username={username} />
          ) : (
            <p className="p-8 text-center text-sm text-white/40">Choose a friend to start chatting.</p>
          )}
        </section>
      </div>
    </div>
  );
}
