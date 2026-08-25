import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { listFriends } from "./friends.service";

export async function getFeedForUser(userId: string) {
  const friends = await listFriends(userId);
  const authorIds = [userId, ...friends.map((f) => f.id)];
  return prisma.post.findMany({
    where: { authorId: { in: authorIds } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: true, _count: { select: { comments: true } } },
  });
}

export async function getPostsByUsername(username: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new HttpError(404, "User not found");
  return prisma.post.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { author: true, _count: { select: { comments: true } } },
  });
}

export async function createPost(
  authorId: string,
  input: { content: string; imageUrl?: string | null; isAiText?: boolean; isAiImage?: boolean },
) {
  return prisma.post.create({
    data: {
      authorId,
      content: input.content,
      imageUrl: input.imageUrl ?? null,
      isAiText: input.isAiText ?? false,
      isAiImage: input.isAiImage ?? false,
    },
    include: { author: true, _count: { select: { comments: true } } },
  });
}

export async function deletePost(userId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new HttpError(404, "Post not found");
  if (post.authorId !== userId) throw new HttpError(403, "Not allowed to delete this post");
  await prisma.post.delete({ where: { id: postId } });
}
