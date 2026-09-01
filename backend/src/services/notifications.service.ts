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

  return parsed.map((n) => {
    const field = ACTOR_FIELD[n.type as NotificationType];
    const actorId = field ? n.payload[field] : undefined;
    const actor = typeof actorId === "string" ? actorsById.get(actorId) : undefined;
    return { ...n, actor: actor ?? null };
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
