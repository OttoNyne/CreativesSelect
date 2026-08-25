import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { areFriends, isBlockedEitherWay } from "./friends.service";

export async function searchUsers(query: string) {
  if (!query.trim()) return [];
  return prisma.user.findMany({
    where: {
      OR: [{ username: { contains: query } }, { displayName: { contains: query } }],
    },
    take: 20,
  });
}

export async function getProfileForViewer(username: string, viewerId: string | undefined) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new HttpError(404, "User not found");

  if (viewerId && (await isBlockedEitherWay(viewerId, user.id))) {
    throw new HttpError(403, "Profile unavailable");
  }

  if (user.isPrivate && user.id !== viewerId) {
    const friends = viewerId ? await areFriends(viewerId, user.id) : false;
    if (!friends) {
      throw new HttpError(403, "This profile is private");
    }
  }

  return user;
}

export async function updateOwnProfile(
  userId: string,
  updates: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    wallpaperUrl?: string | null;
    isPrivate?: boolean;
    theme?: Record<string, string>;
  },
) {
  const { theme, ...rest } = updates;
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  let themeString = current.theme;
  if (theme) {
    const currentTheme = JSON.parse(current.theme || "{}");
    themeString = JSON.stringify({ ...currentTheme, ...theme });
  }
  return prisma.user.update({
    where: { id: userId },
    data: { ...rest, theme: themeString },
  });
}

export async function setTopFriends(ownerId: string, usernames: string[]) {
  const targets = await prisma.user.findMany({ where: { username: { in: usernames } } });
  const byUsername = new Map(targets.map((u) => [u.username, u]));

  await prisma.topFriend.deleteMany({ where: { ownerId } });
  const rows = usernames
    .map((username, index) => {
      const target = byUsername.get(username);
      if (!target || target.id === ownerId) return null;
      return { ownerId, targetId: target.id, position: index };
    })
    .filter((r): r is { ownerId: string; targetId: string; position: number } => r !== null);

  if (rows.length > 0) {
    await prisma.topFriend.createMany({ data: rows });
  }
  return listTopFriends(ownerId);
}

export async function listTopFriends(ownerId: string) {
  const rows = await prisma.topFriend.findMany({
    where: { ownerId },
    orderBy: { position: "asc" },
    include: { target: true },
  });
  return rows.map((r) => r.target);
}

export async function listProfileComments(profileOwnerId: string) {
  return prisma.profileComment.findMany({
    where: { profileOwnerId },
    orderBy: { createdAt: "desc" },
    include: { author: true },
  });
}

export async function addProfileComment(profileOwnerId: string, authorId: string, content: string) {
  if (await isBlockedEitherWay(profileOwnerId, authorId)) {
    throw new HttpError(403, "Cannot comment on this profile");
  }
  return prisma.profileComment.create({
    data: { profileOwnerId, authorId, content },
    include: { author: true },
  });
}

export async function deleteProfileComment(userId: string, commentId: string) {
  const comment = await prisma.profileComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new HttpError(404, "Comment not found");
  if (comment.authorId !== userId && comment.profileOwnerId !== userId) {
    throw new HttpError(403, "Not allowed to delete this comment");
  }
  await prisma.profileComment.delete({ where: { id: commentId } });
}
