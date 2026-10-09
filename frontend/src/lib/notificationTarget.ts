import type { Notification } from "../types";
import { t } from "../i18n";

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
  const actorProfile = n.actor ? { to: `/u/${n.actor.username}`, label: t("target.viewProfile") } : null;

  switch (n.type) {
    case "comment": {
      const postId = str(n.payload.postId);
      if (!postId) return actorProfile;
      const commentId = str(n.payload.commentId);
      return { to: `/posts/${postId}${commentId ? `?comment=${encodeURIComponent(commentId)}` : ""}`, label: t("target.viewPost") };
    }
    case "event_created":
    case "event_updated":
    case "event_reminder": {
      const eventId = str(n.payload.eventId);
      return eventId ? { to: `/events/${eventId}`, label: t("target.viewEvent") } : { to: "/events", label: t("target.seeEvents") };
    }
    case "event_cancelled":
      return { to: "/events", label: t("target.seeEvents") };
    case "media_comment": {
      const mediaId = str(n.payload.mediaId);
      if (!mediaId || !viewerUsername) return viewerUsername ? { to: `/u/${viewerUsername}#portfolio`, label: t("target.viewPortfolio") } : null;
      const commentId = str(n.payload.commentId);
      return { to: `/u/${viewerUsername}?piece=${encodeURIComponent(mediaId)}${commentId ? `&comment=${encodeURIComponent(commentId)}` : ""}#portfolio`, label: t("target.viewComment") };
    }
    case "blog_comment": {
      const entryId = str(n.payload.entryId);
      if (!entryId) return actorProfile;
      const commentId = str(n.payload.commentId);
      return { to: `/blog/${entryId}${commentId ? `?comment=${encodeURIComponent(commentId)}` : ""}`, label: t("target.viewComment") };
    }
    case "profile_comment":
      return viewerUsername ? { to: `/u/${viewerUsername}#testimonials`, label: t("target.viewTestimonial") } : null;
    case "message":
      return n.actor ? { to: `/messages/${n.actor.username}`, label: t("target.openConversation") } : null;
    case "friend_request":
      return { to: "/friends", label: t("target.viewRequest") };
    case "friend_accept":
    case "friend_birthday":
      return actorProfile;
    case "help_offer":
    case "help_accepted":
      return { to: "/help-wanted", label: t("target.viewRequest") };
    case "live_started": {
      const liveId = str(n.payload.liveId);
      return liveId ? { to: `/live/${liveId}`, label: t("target.listenLive") } : null;
    }
    case "invite_joined":
      return actorProfile ? { to: actorProfile.to, label: t("target.viewProfile") } : { to: "/friends", label: t("target.seeFriends") };
    case "blog_post": {
      const entryId = str(n.payload.entryId);
      return entryId ? { to: `/blog/${entryId}`, label: t("target.readEntry") } : actorProfile;
    }
    case "reaction": {
      const targetId = str(n.payload.targetId);
      if (!targetId) return actorProfile;
      if (n.payload.targetType === "post") return { to: `/posts/${targetId}`, label: t("target.viewPost") };
      return viewerUsername ? { to: `/u/${viewerUsername}?piece=${encodeURIComponent(targetId)}#portfolio`, label: t("target.viewPiece") } : actorProfile;
    }
    case "credit_request":
      return viewerUsername ? { to: `/u/${viewerUsername}#portfolio`, label: t("target.viewCredit") } : null;
    case "work_request":
      return viewerUsername ? { to: `/u/${viewerUsername}#work`, label: t("target.viewRequests") } : null;
    case "work_reply":
      return viewerUsername ? { to: `/u/${viewerUsername}#work`, label: t("target.viewAnswer") } : null;
    case "credit_accepted": {
      const itemId = str(n.payload.itemId);
      return viewerUsername ? { to: `/u/${viewerUsername}${itemId ? `?piece=${encodeURIComponent(itemId)}` : ""}#portfolio`, label: t("target.viewCredit") } : null;
    }
    case "follow":
      return actorProfile;
    case "mention": {
      // the server says where, as an address inside the site; anything else is not followed
      const url = str(n.payload.url);
      return url && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") ? { to: url, label: t("target.viewMention") } : actorProfile;
    }
    case "cs_verified":
      return viewerUsername ? { to: `/u/${viewerUsername}`, label: t("target.viewYourProfile") } : null;
    case "live_scheduled":
      return { to: "/live", label: t("target.seeUpcomingLives") };
    case "live_reminder":
      return { to: "/live", label: t("target.openLive") };
    case "group_invite": {
      const groupId = str(n.payload.groupId);
      return { to: groupId ? `/groups/${groupId}` : "/groups", label: t("target.viewGroup") };
    }
    default:
      return null;
  }
}
