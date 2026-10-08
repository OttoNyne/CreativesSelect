import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { bulletinsApi, BULLETINS_CHANGED_EVENT } from "../../api/bulletins.api";
import { t } from "../../i18n";

const POLL_INTERVAL_MS = 60_000;

/** A line at the top of the feed that leads to the bulletin board, with how many new bulletins friends have posted. */
export function BulletinsStrip() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { unread } = await bulletinsApi.unreadCount();
        if (!cancelled) setUnread(unread);
      } catch {
        // keep the previous count
      }
    }
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    window.addEventListener(BULLETINS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(BULLETINS_CHANGED_EVENT, load);
    };
  }, []);

  return (
    <Link to="/bulletins" className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80 hover:bg-white/[0.06]">
      <span>
        <span className="font-medium text-white">{t("bulletinsStrip.title")}</span>
        <span className="text-white/60">{t("bulletinsStrip.blurb")}</span>
      </span>
      {unread > 0 ? (
        <span aria-label={t("bulletinsStrip.new", { count: unread })} className="ms-3 inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold leading-5 text-white">
          {t("bulletinsStrip.new", { count: unread > 99 ? "99+" : unread })}
        </span>
      ) : (
        <span aria-hidden="true" className="ms-3 shrink-0 text-white/60">
          →
        </span>
      )}
    </Link>
  );
}
