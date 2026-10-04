import type { Notification } from "../types";

export interface NotificationTarget {
  /** Where clicking the notification goes. */
  to: string;
  /** What the link says. */
  label: string;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

// Where each kind of notification should take you: the post or comment someone left, the conversation a message is in,
// the profile of the person who accepted you, and so on. Returns null when there is nowhere sensible to go (for example
// a notification whose details are missing), in which case clicking only marks it read.
export function notificationTarget(n: Notification, viewerUsername?: string | null): NotificationTarget | null {
  const actorProfile = n.actor ? { to: `/u/${n.actor.username}`, label: "View profile" } : null;

  switch (n.type) {
    case "comment": {
      const postId = str(n.payload.postId);
      if (!postId) return actorProfile;
      const commentId = str(n.payload.commentId);
      return { to: `/posts/${postId}${commentId ? `?comment=${encodeURIComponent(commentId)}` : ""}`, label: "View post" };
    }
    case "profile_comment":
      return viewerUsername ? { to: `/u/${viewerUsername}#testimonials`, label: "View testimonial" } : null;
    case "message":
      return n.actor ? { to: `/messages/${n.actor.username}`, label: "Open conversation" } : null;
    case "friend_request":
      return { to: "/friends", label: "View request" };
    case "friend_accept":
      return actorProfile;
    case "help_offer":
    case "help_accepted":
      return { to: "/help-wanted", label: "View request" };
    case "live_started": {
      const liveId = str(n.payload.liveId);
      return liveId ? { to: `/live/${liveId}`, label: "Listen live" } : null;
    }
    case "live_scheduled":
      return { to: "/live", label: "See upcoming lives" };
    case "live_reminder":
      return { to: "/live", label: "Open Live" };
    case "group_invite": {
      const groupId = str(n.payload.groupId);
      return { to: groupId ? `/groups/${groupId}` : "/groups", label: "View group" };
    }
    default:
      return null;
  }
}
