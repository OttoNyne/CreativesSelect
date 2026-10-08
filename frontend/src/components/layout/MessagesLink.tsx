import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { messagesApi, MESSAGES_CHANGED_EVENT } from "../../api/messages.api";
import { useLiveRefresh } from "../../lib/liveUpdates";
import { t } from "../../i18n";

const POLL_INTERVAL_MS = 30_000;
// While the live connection is up the server says when a message arrives, so the timer is only a safety net.
const SLOW_POLL_INTERVAL_MS = 300_000;

// The "Messages" nav link with an unread badge. Updated the moment a message arrives, with a quiet poll as a safety net; a failed
// refresh (offline, server waking up) just keeps the last count.
export function MessagesLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const { unread } = await messagesApi.unreadCount();
      setUnread(unread);
    } catch {
      // keep the previous count
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(MESSAGES_CHANGED_EVENT, load);
    return () => window.removeEventListener(MESSAGES_CHANGED_EVENT, load);
  }, [load]);
  useLiveRefresh("message", () => void load(), POLL_INTERVAL_MS, SLOW_POLL_INTERVAL_MS);

  return (
    <Link to="/messages" className={className} onClick={onClick}>
      {t("messages.title")}
      {unread > 0 && (
        <span
          aria-label={t("messages.unreadAria", { count: unread })}
          className="ms-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold leading-5 text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
