import { prisma } from "../lib/prisma";

export type NotificationType = "friend_request" | "friend_accept" | "comment" | "profile_comment" | "group_invite";

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
  return notifications.map((n) => ({ ...n, payload: JSON.parse(n.payload) }));
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, recipientId: userId },
    data: { isRead: true },
  });
}
