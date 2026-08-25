import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { addPostComment, deleteComment, listPostComments } from "../services/comments.service";
import { toPublicUser } from "../utils/serialize";
import { createCommentSchema } from "../utils/validators";
import { createNotification } from "../services/notifications.service";

export const getPostComments = asyncHandler(async (req: Request, res: Response) => {
  const comments = await listPostComments(req.params.postId);
  res.json({
    comments: comments.map((c) => ({ id: c.id, content: c.content, createdAt: c.createdAt, author: toPublicUser(c.author) })),
  });
});

export const postPostComment = asyncHandler(async (req: Request, res: Response) => {
  const { content } = createCommentSchema.parse(req.body);
  const { comment, postAuthorId } = await addPostComment(req.params.postId, req.user!.id, content);
  if (postAuthorId !== req.user!.id) {
    await createNotification(postAuthorId, "comment", { authorId: req.user!.id, postId: req.params.postId });
  }
  res.status(201).json({ comment: { ...comment, author: toPublicUser(comment.author) } });
});

export const deleteCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteComment(req.user!.id, req.params.id);
  res.status(204).send();
});
