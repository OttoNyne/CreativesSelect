import { Request, Response } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import {
  listFriends,
  listIncomingRequests,
  removeFriend,
  respondToRequest,
  sendFriendRequest,
} from "../services/friends.service";
import { toPublicUser } from "../utils/serialize";
import { createNotification } from "../services/notifications.service";
import { prisma } from "../lib/prisma";

export const getFriends = asyncHandler(async (req: Request, res: Response) => {
  const friends = await listFriends(req.user!.id);
  res.json({ friends: friends.map(toPublicUser) });
});

export const getIncomingRequests = asyncHandler(async (req: Request, res: Response) => {
  const requests = await listIncomingRequests(req.user!.id);
  res.json({
    requests: requests.map((r) => ({ id: r.id, createdAt: r.createdAt, requester: toPublicUser(r.requester) })),
  });
});

export const postFriendRequest = asyncHandler(async (req: Request, res: Response) => {
  const friendship = await sendFriendRequest(req.user!.id, req.params.username);
  const addressee = await prisma.user.findUnique({ where: { id: friendship.addresseeId } });
  if (addressee) {
    await createNotification(addressee.id, "friend_request", {
      requesterId: req.user!.id,
      friendshipId: friendship.id,
    });
  }
  res.status(201).json({ friendship });
});

export const acceptFriendRequest = asyncHandler(async (req: Request, res: Response) => {
  const friendship = await respondToRequest(req.user!.id, req.params.requestId, true);
  await createNotification(friendship.requesterId, "friend_accept", { addresseeId: req.user!.id });
  res.json({ friendship });
});

export const declineFriendRequest = asyncHandler(async (req: Request, res: Response) => {
  const friendship = await respondToRequest(req.user!.id, req.params.requestId, false);
  res.json({ friendship });
});

export const deleteFriend = asyncHandler(async (req: Request, res: Response) => {
  if (!req.params.friendId) throw new HttpError(400, "friendId required");
  await removeFriend(req.user!.id, req.params.friendId);
  res.status(204).send();
});
