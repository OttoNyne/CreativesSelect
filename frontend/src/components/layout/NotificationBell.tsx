import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { notificationsApi } from "../../api/notifications.api";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import { useAuth } from "../../context/AuthContext";
import { notificationTarget } from "../../lib/notificationTarget";
import { formatWhen } from "../../lib/when";
import type { Notification } from "../../types";

const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function describe(n: Notification): string {
  switch (n.type) {
    case "friend_request":
      if (n.friendshipStatus === "accepted") return "sent you a friend request — accepted";
      if (n.friendshipStatus === "declined") return "sent you a friend request — declined";
      return "sent you a friend request";
    case "friend_accept":
      return "accepted your friend request";
    case "comment":
      return "commented on your post";
    case "profile_comment":
      return "left a comment on your profile";
    case "media_comment":
      return "commented on your portfolio";
    case "blog_comment":
      return typeof n.payload.title === "string" ? `commented on your blog entry "${n.payload.title}"` : "commented on your blog entry";
    case "friend_birthday":
      return "has a birthday today 🎂";
    case "cs_verified":
      return n.payload.reason === "friends" ? "— you're now CSverified: you have 1,000 active friends." : "— you're now CSverified: an administrator gave you the badge.";
    case "event_created":
      return typeof n.payload.title === "string" && typeof n.payload.startsAt === "string" ? `is planning an event: "${n.payload.title}", ${formatWhen(n.payload.startsAt)}` : "is planning an event";
    case "event_updated": {
      const changed = Array.isArray(n.payload.changed) ? n.payload.changed.filter((c): c is string => typeof c === "string") : [];
      const what = changed.length ? ` — the ${changed.join(" and ")} changed` : " — it changed";
      return typeof n.payload.title === "string" ? `changed an event you answered: "${n.payload.title}"${what}` : `changed an event you answered${what}`;
    }
    case "event_cancelled":
      return typeof n.payload.title === "string" ? `cancelled an event: "${n.payload.title}"` : "cancelled an event";
    case "event_reminder":
      return n.payload.own === true ? `— your event "${String(n.payload.title ?? "")}" starts soon` : `has an event starting soon: "${String(n.payload.title ?? "")}"`;
    case "help_accepted":
      return typeof n.payload.title === "string"
        ? `accepted your offer to help with "${n.payload.title}"`
        : "accepted your offer to help";
    case "message": {
      const count = typeof n.payload.count === "number" ? n.payload.count : 1;
      return count > 1 ? `sent you ${count} messages` : "sent you a message";
    }
    case "live_started":
      return typeof n.payload.title === "string" ? `is live now: "${n.payload.title}"` : "is live now";
    case "report_resolved":
      return n.payload.outcome === "action_taken" ? "— a moderator looked at your report and took action. Thank you." : "— a moderator looked at your report and found nothing to act on. Thank you.";
    case "content_removed":
      return `— a moderator removed your ${typeof n.payload.what === "string" ? n.payload.what : "content"} for breaking the site's rules`;
    case "invite_joined":
      return "joined with your invite link — you're friends";
    case "blog_post":
      return typeof n.payload.title === "string" ? `wrote a blog entry: "${n.payload.title}"` : "wrote a blog entry";
    case "live_scheduled":
      return typeof n.payload.title === "string" && typeof n.payload.startsAt === "string"
        ? `scheduled a live: "${n.payload.title}", ${formatWhen(n.payload.startsAt)}`
        : "scheduled a live";
    case "live_reminder":
      return n.payload.own === true ? `— your live "${String(n.payload.title ?? "")}" starts soon` : `has a live starting soon: "${String(n.payload.title ?? "")}"`;
    case "help_offer":
      return typeof n.payload.title === "string"
        ? `offered to help with "${n.payload.title}"`
        : "offered to help with your request";
    default:
      return "sent you a notification";
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
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

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
      alert(err instanceof ApiError ? err.message : "Couldn't accept that request.");
    }
  }

  async function handleAcceptOffer(n: Notification) {
    try {
      await notificationsApi.acceptOffer(n.id);
      setNotifications((ns) =>
        ns.map((item) => (item.id === n.id ? { ...item, isRead: true, payload: { ...item.payload, accepted: true } } : item))
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't accept that offer.");
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
      alert(err instanceof ApiError ? err.message : "Couldn't decline that request.");
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-white/10 bg-[#15151c] shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-violet-400 hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && <p className="p-3 text-xs text-white/60">Loading…</p>}
            {!loading && notifications.length === 0 && (
              <p className="p-3 text-xs text-white/60">You're all caught up.</p>
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
                      <span className="font-medium text-white">Someone</span>
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
                  <p className="mt-0.5 text-[10px] text-white/60">{timeAgo(n.createdAt)}</p>

                  {n.type === "help_offer" && (
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      {n.payload.accepted ? (
                        <span className="text-[10px] text-emerald-400">Accepted ✓</span>
                      ) : (
                        <button
                          onClick={() => handleAcceptOffer(n)}
                          className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-500"
                        >
                          Accept offer
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
                        Accept
                      </button>
                      <button
                        onClick={() => handleDecline(n)}
                        className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {hasMore && (
              <button type="button" onClick={showOlder} disabled={loadingMore} className="block w-full border-t border-white/5 px-3 py-2 text-xs text-violet-300 hover:bg-white/5 disabled:opacity-50">
                {loadingMore ? "Loading…" : "Show older notifications"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
