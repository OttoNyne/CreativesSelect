import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

export async function areFriends(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return true;
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: userIdA, addresseeId: userIdB },
        { requesterId: userIdB, addresseeId: userIdA },
      ],
    },
  });
  return Boolean(friendship);
}

export async function isBlockedEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
  });
  return Boolean(block);
}

export async function listFriends(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: { requester: true, addressee: true },
  });
  return friendships.map((f) => (f.requesterId === userId ? f.addressee : f.requester));
}

export async function listIncomingRequests(userId: string) {
  return prisma.friendship.findMany({
    where: { addresseeId: userId, status: "pending" },
    include: { requester: true },
  });
}

export async function sendFriendRequest(requesterId: string, addresseeUsername: string) {
  const addressee = await prisma.user.findUnique({ where: { username: addresseeUsername } });
  if (!addressee) throw new HttpError(404, "User not found");
  if (addressee.id === requesterId) throw new HttpError(400, "Cannot friend yourself");

  if (await isBlockedEitherWay(requesterId, addressee.id)) {
    throw new HttpError(403, "Cannot send a friend request to this user");
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId: addressee.id },
        { requesterId: addressee.id, addresseeId: requesterId },
      ],
    },
  });
  if (existing) throw new HttpError(409, "Friend request already exists");

  return prisma.friendship.create({
    data: { requesterId, addresseeId: addressee.id, status: "pending" },
  });
}

export async function respondToRequest(userId: string, requestId: string, accept: boolean) {
  const request = await prisma.friendship.findUnique({ where: { id: requestId } });
  if (!request || request.addresseeId !== userId) {
    throw new HttpError(404, "Friend request not found");
  }
  return prisma.friendship.update({
    where: { id: requestId },
    data: { status: accept ? "accepted" : "declined" },
  });
}

export async function removeFriend(userId: string, friendId: string) {
  await prisma.friendship.deleteMany({
    where: {
      status: "accepted",
      OR: [
        { requesterId: userId, addresseeId: friendId },
        { requesterId: friendId, addresseeId: userId },
      ],
    },
  });
}
