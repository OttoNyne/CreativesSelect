import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getSearchImages, postGenerateImage, postGenerateText } from "../controllers/ai.controller";

export const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.post("/text", postGenerateText);
aiRouter.post("/image", postGenerateImage);
aiRouter.get("/images/search", getSearchImages);
