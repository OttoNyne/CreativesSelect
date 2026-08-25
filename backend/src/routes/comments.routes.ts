import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { deleteCommentHandler, getPostComments, postPostComment } from "../controllers/comments.controller";

export const commentsRouter = Router();

commentsRouter.get("/posts/:postId/comments", getPostComments);
commentsRouter.post("/posts/:postId/comments", requireAuth, postPostComment);
commentsRouter.delete("/comments/:id", requireAuth, deleteCommentHandler);
