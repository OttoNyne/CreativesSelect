import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

export async function listPostComments(postId: string) {
  return prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    include: { author: true },
  });
}

export async function addPostComment(postId: string, authorId: string, content: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new HttpError(404, "Post not found");
  const comment = await prisma.comment.create({
    data: { postId, authorId, content },
    include: { author: true },
  });
  return { comment, postAuthorId: post.authorId };
}

export async function deleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: true } });
  if (!comment) throw new HttpError(404, "Comment not found");
  if (comment.authorId !== userId && comment.post.authorId !== userId) {
    throw new HttpError(403, "Not allowed to delete this comment");
  }
  await prisma.comment.delete({ where: { id: commentId } });
}
