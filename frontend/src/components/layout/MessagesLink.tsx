import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { messagesApi, MESSAGES_CHANGED_EVENT } from "../../api/messages.api";

const POLL_INTERVAL_MS = 30_000;

// The "Messages" nav link with an unread badge. Polls quietly; a failed poll
// (offline, server waking up) just keeps the last count.
export function MessagesLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { unread } = await messagesApi.unreadCount();
        if (!cancelled) setUnread(unread);
      } catch {
        // keep the previous count
      }
    }
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    window.addEventListener(MESSAGES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, load);
    };
  }, []);

  return (
    <Link to="/messages" className={className} onClick={onClick}>
      Messages
      {unread > 0 && (
        <span
          aria-label={`${unread} unread`}
          className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold leading-5 text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
