import { prisma } from "../lib/prisma";
import { toPublicUser } from "../utils/serialize";

export type NotificationType = "friend_request" | "friend_accept" | "comment" | "profile_comment" | "group_invite";

// Which payload field holds the "other user" a notification is about, so we
// can resolve and attach their public profile for display (avatar, name).
const ACTOR_FIELD: Partial<Record<NotificationType, string>> = {
  friend_request: "requesterId",
  friend_accept: "addresseeId",
  comment: "authorId",
  profile_comment: "authorId",
};

export async function createNotification(
  recipientId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
) {
  return prisma.notification.create({
    data: { recipientId, type, payload: JSON.stringify(payload) },
  });
}

export async function listNotifications(userId: string) {
  const notifications = await prisma.notification.findMany({
    where: { recipientId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const parsed = notifications.map((n) => ({ ...n, payload: JSON.parse(n.payload) as Record<string, unknown> }));

  const actorIds = new Set<string>();
  for (const n of parsed) {
    const field = ACTOR_FIELD[n.type as NotificationType];
    const actorId = field ? n.payload[field] : undefined;
    if (typeof actorId === "string") actorIds.add(actorId);
  }

  const actors =
    actorIds.size > 0 ? await prisma.user.findMany({ where: { id: { in: [...actorIds] } } }) : [];
  const actorsById = new Map(actors.map((u) => [u.id, toPublicUser(u)]));

  // A friend_request notification's Accept/Decline actions only make sense
  // while the underlying friendship is still pending — otherwise (already
  // accepted/declined, e.g. from a previous session) they'd silently
  // re-respond to a request that's already been resolved.
  const friendshipIds = parsed
    .filter((n) => n.type === "friend_request")
    .map((n) => n.payload.friendshipId)
    .filter((id): id is string => typeof id === "string");
  const friendships =
    friendshipIds.length > 0
      ? await prisma.friendship.findMany({ where: { id: { in: friendshipIds } } })
      : [];
  const friendshipStatusById = new Map(friendships.map((f) => [f.id, f.status]));

  return parsed.map((n) => {
    const field = ACTOR_FIELD[n.type as NotificationType];
    const actorId = field ? n.payload[field] : undefined;
    const actor = typeof actorId === "string" ? actorsById.get(actorId) : undefined;

    let friendshipStatus: string | null = null;
    if (n.type === "friend_request" && typeof n.payload.friendshipId === "string") {
      friendshipStatus = friendshipStatusById.get(n.payload.friendshipId) ?? null;
    }

    return { ...n, actor: actor ?? null, friendshipStatus };
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, recipientId: userId },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { recipientId: userId, isRead: false },
    data: { isRead: true },
  });
}
