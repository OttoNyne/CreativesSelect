import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { notificationsApi } from "../../api/notifications.api";
import { friendsApi } from "../../api/friends.api";
import { Avatar } from "../common/Avatar";
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
    default:
      return "sent you a notification";
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function load() {
    try {
      const { notifications } = await notificationsApi.list();
      setNotifications(notifications);
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
    await notificationsApi.markRead(id);
  }

  async function handleMarkAllRead() {
    setNotifications((ns) => ns.map((n) => ({ ...n, isRead: true })));
    await notificationsApi.markAllRead();
  }

  async function handleAccept(n: Notification) {
    const friendshipId = n.payload.friendshipId;
    if (typeof friendshipId !== "string") return;
    await friendsApi.accept(friendshipId);
    setNotifications((ns) => ns.filter((item) => item.id !== n.id));
    await notificationsApi.markRead(n.id);
  }

  async function handleDecline(n: Notification) {
    const friendshipId = n.payload.friendshipId;
    if (typeof friendshipId !== "string") return;
    await friendsApi.decline(friendshipId);
    setNotifications((ns) => ns.filter((item) => item.id !== n.id));
    await notificationsApi.markRead(n.id);
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
            {loading && <p className="p-3 text-xs text-white/40">Loading…</p>}
            {!loading && notifications.length === 0 && (
              <p className="p-3 text-xs text-white/40">You're all caught up.</p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.isRead && handleMarkRead(n.id)}
                className={`flex gap-2 border-b border-white/5 px-3 py-2 last:border-0 ${
                  n.isRead ? "" : "cursor-pointer bg-violet-500/10"
                }`}
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
                  <p className="mt-0.5 text-[10px] text-white/30">{timeAgo(n.createdAt)}</p>

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
          </div>
        </div>
      )}
    </div>
  );
}
