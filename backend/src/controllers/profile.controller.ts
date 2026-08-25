import { Request, Response } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import {
  addProfileComment,
  deleteProfileComment,
  getProfileForViewer,
  listProfileComments,
  listTopFriends,
  searchUsers,
  setTopFriends,
  updateOwnProfile,
} from "../services/profile.service";
import { toPublicUser } from "../utils/serialize";
import { updateProfileSchema, topFriendsSchema, createCommentSchema } from "../utils/validators";
import { createNotification } from "../services/notifications.service";
import { prisma } from "../lib/prisma";

export const getSearchUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = typeof req.query.search === "string" ? req.query.search : "";
  const users = await searchUsers(query);
  res.json({ users: users.map(toPublicUser) });
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await getProfileForViewer(req.params.username, req.user?.id);
  res.json({ user: toPublicUser(user) });
});

export const patchOwnProfile = asyncHandler(async (req: Request, res: Response) => {
  const updates = updateProfileSchema.parse(req.body);
  const user = await updateOwnProfile(req.user!.id, updates);
  res.json({ user: toPublicUser(user) });
});

export const getTopFriends = asyncHandler(async (req: Request, res: Response) => {
  const owner = await prisma.user.findUnique({ where: { username: req.params.username } });
  if (!owner) throw new HttpError(404, "User not found");
  const friends = await listTopFriends(owner.id);
  res.json({ topFriends: friends.map(toPublicUser) });
});

export const putTopFriends = asyncHandler(async (req: Request, res: Response) => {
  const { usernames } = topFriendsSchema.parse(req.body);
  const friends = await setTopFriends(req.user!.id, usernames);
  res.json({ topFriends: friends.map(toPublicUser) });
});

export const getProfileComments = asyncHandler(async (req: Request, res: Response) => {
  const owner = await prisma.user.findUnique({ where: { username: req.params.username } });
  if (!owner) throw new HttpError(404, "User not found");
  const comments = await listProfileComments(owner.id);
  res.json({
    comments: comments.map((c) => ({ id: c.id, content: c.content, createdAt: c.createdAt, author: toPublicUser(c.author) })),
  });
});

export const postProfileComment = asyncHandler(async (req: Request, res: Response) => {
  const { content } = createCommentSchema.parse(req.body);
  const owner = await prisma.user.findUnique({ where: { username: req.params.username } });
  if (!owner) throw new HttpError(404, "User not found");
  const comment = await addProfileComment(owner.id, req.user!.id, content);
  if (owner.id !== req.user!.id) {
    await createNotification(owner.id, "profile_comment", { authorId: req.user!.id, commentId: comment.id });
  }
  res.status(201).json({ comment: { ...comment, author: toPublicUser(comment.author) } });
});

export const deleteProfileCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteProfileComment(req.user!.id, req.params.commentId);
  res.status(204).send();
});
