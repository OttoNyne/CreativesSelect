import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { notificationsApi } from "../../api/notifications.api";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import { useAuth } from "../../context/AuthContext";
import { notificationTarget } from "../../lib/notificationTarget";
import { formatWhen } from "../../lib/when";
import { REACTIONS } from "../../lib/reactions";
import { useLiveRefresh } from "../../lib/liveUpdates";
import type { Notification } from "../../types";
import { t, locale, type Key } from "../../i18n";
import { shortAgo } from "../../lib/when";

const POLL_INTERVAL_MS = 30_000;
// While the live connection is up the server says when something new arrives, so the timer is only a safety net.
const SLOW_POLL_INTERVAL_MS = 300_000;

// What the server calls the kinds of thing a moderator can remove, and the text for each.
const REMOVED_WHAT: Record<string, Key> = {
  post: "notif.what.post",
  comment: "notif.what.comment",
  testimonial: "notif.what.testimonial",
  "comment on a portfolio piece": "notif.what.mediaComment",
  "comment on a blog entry": "notif.what.blogComment",
  event: "notif.what.event",
  "blog entry": "notif.what.blogEntry",
  bulletin: "notif.what.bulletin",
  "group topic": "notif.what.groupTopic",
  "group reply": "notif.what.groupReply",
  content: "notif.what.content",
};
const CHANGED_WHAT: Record<string, Key> = { time: "notif.change.time", place: "notif.change.place", link: "notif.change.link" };

function describe(n: Notification): string {
  const title = typeof n.payload.title === "string" ? n.payload.title : null;
  const startsAt = typeof n.payload.startsAt === "string" ? n.payload.startsAt : null;
  switch (n.type) {
    case "friend_request":
      if (n.friendshipStatus === "accepted") return t("notif.friendRequestAccepted");
      if (n.friendshipStatus === "declined") return t("notif.friendRequestDeclined");
      return t("notif.friendRequest");
    case "friend_accept":
      return t("notif.friendAccept");
    case "comment":
      return t("notif.comment");
    case "profile_comment":
      return t("notif.profileComment");
    case "media_comment":
      return t("notif.mediaComment");
    case "blog_comment":
      return title !== null ? t("notif.blogCommentTitled", { title }) : t("notif.blogComment");
    case "friend_birthday":
      return t("notif.birthday");
    case "reaction": {
      const mark = REACTIONS.find((r) => r.key === n.payload.emoji)?.emoji ?? "";
      return n.payload.targetType === "post" ? t("notif.reactedPost", { mark }) : t("notif.reactedPortfolio", { mark });
    }
    case "cs_verified":
      return n.payload.reason === "friends" ? t("notif.verifiedFriends") : t("notif.verifiedAdmin");
    case "event_created":
      return title !== null && startsAt !== null ? t("notif.eventCreatedFull", { title, when: formatWhen(startsAt) }) : t("notif.eventCreated");
    case "event_updated": {
      const changed = Array.isArray(n.payload.changed) ? n.payload.changed.filter((c): c is string => typeof c === "string") : [];
      const list = new Intl.ListFormat(locale(), { type: "conjunction" }).format(changed.map((c) => (CHANGED_WHAT[c] ? t(CHANGED_WHAT[c]) : c)));
      const what = changed.length ? t("notif.eventChangedList", { list }) : t("notif.eventChanged");
      return title !== null ? t("notif.eventUpdatedTitled", { title, what }) : t("notif.eventUpdated", { what });
    }
    case "event_cancelled":
      return title !== null ? t("notif.eventCancelledTitled", { title }) : t("notif.eventCancelled");
    case "event_reminder":
      return n.payload.own === true ? t("notif.eventReminderOwn", { title: String(n.payload.title ?? "") }) : t("notif.eventReminder", { title: String(n.payload.title ?? "") });
    case "help_accepted":
      return title !== null ? t("notif.helpAcceptedTitled", { title }) : t("notif.helpAccepted");
    case "message": {
      const count = typeof n.payload.count === "number" ? n.payload.count : 1;
      return t("notif.messages", { n: count });
    }
    case "live_started":
      return title !== null ? t("notif.liveStartedTitled", { title }) : t("notif.liveStarted");
    case "report_resolved":
      return n.payload.outcome === "action_taken" ? t("notif.reportActioned") : t("notif.reportNothing");
    case "content_removed": {
      const what = typeof n.payload.what === "string" ? n.payload.what : "content";
      return t("notif.removed", { what: REMOVED_WHAT[what] ? t(REMOVED_WHAT[what]) : what });
    }
    case "invite_joined":
      return t("notif.inviteJoined");
    case "blog_post":
      return title !== null ? t("notif.blogPostTitled", { title }) : t("notif.blogPost");
    case "live_scheduled":
      return title !== null && startsAt !== null ? t("notif.liveScheduledFull", { title, when: formatWhen(startsAt) }) : t("notif.liveScheduled");
    case "live_reminder":
      return n.payload.own === true ? t("notif.liveReminderOwn", { title: String(n.payload.title ?? "") }) : t("notif.liveReminder", { title: String(n.payload.title ?? "") });
    case "help_offer":
      return title !== null ? t("notif.helpOfferTitled", { title }) : t("notif.helpOffer");
    default:
      return t("notif.default");
  }
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { user: viewer } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const olderLoaded = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function load() {
    try {
      const { notifications: first, hasMore: more } = await notificationsApi.list();
      // The newest page replaces what we had, but older pages already loaded stay (ids sort by time).
      setNotifications((old) => {
        const oldestFirst = first[first.length - 1]?.id;
        const older = oldestFirst ? old.filter((n) => n.id < oldestFirst) : [];
        return [...first, ...older];
      });
      if (!olderLoaded.current) setHasMore(Boolean(more));
    } catch {
      // A failed poll (offline, server waking up) just keeps the last list; the
      // next poll retries.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);
  useLiveRefresh("notification", () => void load(), POLL_INTERVAL_MS, SLOW_POLL_INTERVAL_MS);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  async function handleMarkRead(id: string) {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await notificationsApi.markRead(id).catch(() => load());
  }

  // Clicking a notification takes you to what it was about (and marks it read).
  function openNotification(n: Notification) {
    if (!n.isRead) void handleMarkRead(n.id);
    const target = notificationTarget(n, viewer?.username);
    if (!target) return;
    setOpen(false);
    navigate(target.to);
  }

  async function showOlder() {
    const oldest = notifications[notifications.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const next = await notificationsApi.list(oldest.id);
      olderLoaded.current = true;
      setNotifications((old) => [...old, ...next.notifications.filter((n) => !old.some((o) => o.id === n.id))]);
      setHasMore(Boolean(next.hasMore));
    } catch {
      // try again when they click it again
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((ns) => ns.map((n) => ({ ...n, isRead: true })));
    await notificationsApi.markAllRead().catch(() => load());
  }

  async function handleAccept(n: Notification) {
    const friendshipId = n.payload.friendshipId;
    if (typeof friendshipId !== "string") return;
    try {
      await friendsApi.accept(friendshipId);
      setNotifications((ns) => ns.filter((item) => item.id !== n.id));
      await notificationsApi.markRead(n.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("friends.acceptFailed"));
    }
  }

  async function handleAcceptOffer(n: Notification) {
    try {
      await notificationsApi.acceptOffer(n.id);
      setNotifications((ns) =>
        ns.map((item) => (item.id === n.id ? { ...item, isRead: true, payload: { ...item.payload, accepted: true } } : item))
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("notif.acceptOfferFailed"));
    }
  }

  async function handleDecline(n: Notification) {
    const friendshipId = n.payload.friendshipId;
    if (typeof friendshipId !== "string") return;
    try {
      await friendsApi.decline(friendshipId);
      setNotifications((ns) => ns.filter((item) => item.id !== n.id));
      await notificationsApi.markRead(n.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("friends.declineFailed"));
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label={t("notif.title")}
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-30 mt-2 w-80 rounded-lg border border-white/10 bg-[#15151c] shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-sm font-semibold text-white">{t("notif.title")}</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-violet-400 hover:underline">
                {t("notif.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && <p className="p-3 text-xs text-white/60">{t("common.loading")}</p>}
            {!loading && notifications.length === 0 && (
              <p className="p-3 text-xs text-white/60">{t("notif.caughtUp")}</p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => openNotification(n)}
                className={`flex gap-2 border-b border-white/5 px-3 py-2 last:border-0 ${
                  notificationTarget(n, viewer?.username) || !n.isRead ? "cursor-pointer" : ""
                } ${n.isRead ? "hover:bg-white/5" : "bg-violet-500/10"}`}
              >
                {n.actor ? (
                  <Link to={`/u/${n.actor.username}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <Avatar username={n.actor.username} displayName={n.actor.displayName} avatarUrl={n.actor.avatarUrl} size={32} />
                  </Link>
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/80">
                    {n.actor ? (
                      <Link
                        to={`/u/${n.actor.username}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-white hover:underline"
                      >
                        {n.actor.displayName}
                      </Link>
                    ) : (
                      <span className="font-medium text-white">{t("common.someone")}</span>
                    )}{" "}
                    {describe(n)}
                  </p>
                  {(() => {
                    const target = notificationTarget(n, viewer?.username);
                    if (!target) return null;
                    return (
                      <Link
                        to={target.to}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!n.isRead) handleMarkRead(n.id);
                          setOpen(false);
                        }}
                        className={
                          n.type === "live_started"
                            ? "mt-1 inline-block rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-500"
                            : "mt-1 inline-block text-[11px] font-medium text-violet-300 hover:underline"
                        }
                      >
                        {target.label}
                      </Link>
                    );
                  })()}
                  {n.type === "help_offer" && typeof n.payload.message === "string" && (
                    <p className="mt-1 whitespace-pre-wrap rounded bg-white/5 px-2 py-1 text-xs italic text-white/70">
                      “{n.payload.message}”
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-white/60">{shortAgo(n.createdAt)}</p>

                  {n.type === "help_offer" && (
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      {n.payload.accepted ? (
                        <span className="text-[10px] text-emerald-400">{t("notif.accepted")}</span>
                      ) : (
                        <button
                          onClick={() => handleAcceptOffer(n)}
                          className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-500"
                        >
                          {t("notif.acceptOffer")}
                        </button>
                      )}
                    </div>
                  )}

                  {n.type === "friend_request" && n.friendshipStatus === "pending" && (
                    <div className="mt-1.5 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleAccept(n)}
                        className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-500"
                      >
                        {t("friends.accept")}
                      </button>
                      <button
                        onClick={() => handleDecline(n)}
                        className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                      >
                        {t("friends.decline")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {hasMore && (
              <button type="button" onClick={showOlder} disabled={loadingMore} className="block w-full border-t border-white/5 px-3 py-2 text-xs text-violet-300 hover:bg-white/5 disabled:opacity-50">
                {loadingMore ? t("common.loading") : t("notif.showOlder")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
