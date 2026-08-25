import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { postGenerateImage, postGenerateText } from "../controllers/ai.controller";

export const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.post("/text", postGenerateText);
aiRouter.post("/image", postGenerateImage);
