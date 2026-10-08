import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { groupsApi, MAX_GROUP_MESSAGE_LENGTH } from "../../api/groups.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { GroupChatMessage } from "../../types";
import { t } from "../../i18n";
import { Linkified } from "../common/Linkified";
import { MentionTextarea } from "../common/MentionField";

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
          setError(err instanceof ApiError ? err.message : t("groups.couldntLoadTheChat"));
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
      const { message } = await groupsApi.sendMessage(groupId, body);
      stickToBottom.current = true;
      setMessages((prev) => [...prev, message]);
      setDraft("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("messages.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("groups.deleteThisMessageFor"))) return;
    setActionError(null);
    try {
      await groupsApi.deleteMessage(groupId, id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("messages.deleteFailed"));
    }
  }

  return (
    <section aria-label={t("groups.groupChat")} className="rounded-xl border border-white/10 bg-white/[0.03]">
      <h2 className="border-b border-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white/60">{t("groups.groupChat")}</h2>

      {state === "loading" && <p className="p-4 text-sm text-white/60">{t("common.loading")}</p>}
      {state === "error" && <p className="p-4 text-sm text-red-400">{error}</p>}
      {state === "ready" && (
        <>
          <div ref={listRef} className="max-h-80 min-h-[8rem] space-y-3 overflow-y-auto px-4 py-3">
            {hasMore && (
              <button onClick={loadEarlier} className="mx-auto block text-xs text-violet-400 hover:underline">
                {t("messages.loadEarlier")}
              </button>
            )}
            {messages.length === 0 && <p className="py-4 text-center text-sm text-white/60">{t("groups.noMessagesYetStart")}</p>}
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                {m.sender && <Avatar username={m.sender.username} displayName={m.sender.displayName} avatarUrl={m.sender.avatarUrl} size={28} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs text-white/60">
                    {m.sender ? (
                      <Link to={`/u/${m.sender.username}`} className="font-medium text-white/80 hover:underline">
                        {m.mine ? t("groups.you") : m.sender.displayName}
                      </Link>
                    ) : (
                      <span>{t("groups.formerMember")}</span>
                    )}
                    <span>{timeLabel(m.createdAt)}</span>
                    {(m.mine || canModerate) && (
                      <button onClick={() => handleDelete(m.id)} aria-label={t("messages.deleteLabel")} className="hover:text-white">
                        {t("common.delete")}
                      </button>
                    )}
                  </div>
                  <p dir="auto" className="whitespace-pre-wrap break-words text-sm text-white"><Linkified text={m.body} /></p>
                </div>
              </div>
            ))}
          </div>

          {actionError && <p className="px-4 text-xs text-red-400">{actionError}</p>}
          <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-white/10 p-3">
            <MentionTextarea
              wrapperClassName="relative flex-1"
              listAbove
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
              placeholder={t("groups.messageTheGroup")}
              aria-label={t("groups.groupMessage")}
              className="max-h-32 min-h-[2.25rem] w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {sending ? t("common.sending") : t("messages.send")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
