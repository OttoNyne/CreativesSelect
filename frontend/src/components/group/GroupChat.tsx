import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { groupsApi, MAX_GROUP_MESSAGE_LENGTH } from "../../api/groups.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { GroupChatMessage } from "../../types";

const POLL_MS = 5_000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// The group's chat, shown to members only (the server enforces that too).
export function GroupChat({ groupId, canModerate }: { groupId: string; canModerate: boolean }) {
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const refresh = useCallback(
    async (first = false) => {
      try {
        const res = await groupsApi.messages(groupId);
        // Keep older pages already loaded; the newest page is replaced (it may have
        // gained messages or lost ones that were deleted).
        setMessages((prev) => {
          const firstId = res.messages[0]?.id;
          const older = firstId ? prev.filter((m) => m.id < firstId) : [];
          return [...older, ...res.messages];
        });
        if (first) setHasMore(res.hasMore);
        setState("ready");
      } catch (err) {
        if (first) {
          setError(err instanceof ApiError ? err.message : "Couldn't load the chat.");
          setState("error");
        }
        // a failed background poll just tries again next time
      }
    },
    [groupId]
  );

  useEffect(() => {
    refresh(true);
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadEarlier() {
    if (!messages.length) return;
    stickToBottom.current = false;
    try {
      const res = await groupsApi.messages(groupId, messages[0].id);
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
      const { message } = await groupsApi.sendMessage(groupId, body);
      stickToBottom.current = true;
      setMessages((prev) => [...prev, message]);
      setDraft("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this message for everyone in the group?")) return;
    setActionError(null);
    try {
      await groupsApi.deleteMessage(groupId, id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't delete that message.");
    }
  }

  return (
    <section aria-label="Group chat" className="rounded-xl border border-white/10 bg-white/[0.03]">
      <h2 className="border-b border-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white/60">Group chat</h2>

      {state === "loading" && <p className="p-4 text-sm text-white/40">Loading…</p>}
      {state === "error" && <p className="p-4 text-sm text-red-400">{error}</p>}
      {state === "ready" && (
        <>
          <div ref={listRef} className="max-h-80 min-h-[8rem] space-y-3 overflow-y-auto px-4 py-3">
            {hasMore && (
              <button onClick={loadEarlier} className="mx-auto block text-xs text-violet-400 hover:underline">
                Load earlier messages
              </button>
            )}
            {messages.length === 0 && <p className="py-4 text-center text-sm text-white/40">No messages yet — start the conversation.</p>}
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                {m.sender && <Avatar username={m.sender.username} displayName={m.sender.displayName} avatarUrl={m.sender.avatarUrl} size={28} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs text-white/40">
                    {m.sender ? (
                      <Link to={`/u/${m.sender.username}`} className="font-medium text-white/80 hover:underline">
                        {m.mine ? "You" : m.sender.displayName}
                      </Link>
                    ) : (
                      <span>Former member</span>
                    )}
                    <span>{timeLabel(m.createdAt)}</span>
                    {(m.mine || canModerate) && (
                      <button onClick={() => handleDelete(m.id)} aria-label="Delete message" className="hover:text-white">
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-white">{m.body}</p>
                </div>
              </div>
            ))}
          </div>

          {actionError && <p className="px-4 text-xs text-red-400">{actionError}</p>}
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
              maxLength={MAX_GROUP_MESSAGE_LENGTH}
              rows={1}
              placeholder="Message the group…"
              aria-label="Group message"
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
        </>
      )}
    </section>
  );
}
