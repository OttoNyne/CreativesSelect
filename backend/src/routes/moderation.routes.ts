import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { deleteBlock, postBlock, postReport } from "../controllers/moderation.controller";

export const moderationRouter = Router();

moderationRouter.use(requireAuth);
moderationRouter.post("/users/:username/block", postBlock);
moderationRouter.delete("/users/:username/block", deleteBlock);
moderationRouter.post("/reports", postReport);
