import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getAIService } from "../services/ai";
import { aiImageRequestSchema, aiTextRequestSchema, imageSearchQuerySchema } from "../utils/validators";

export const postGenerateText = asyncHandler(async (req: Request, res: Response) => {
  const input = aiTextRequestSchema.parse(req.body);
  const result = await getAIService().generateText(input);
  res.json(result);
});

export const postGenerateImage = asyncHandler(async (req: Request, res: Response) => {
  const input = aiImageRequestSchema.parse(req.body);
  const result = await getAIService().generateImage(input);
  res.json(result);
});

export const getSearchImages = asyncHandler(async (req: Request, res: Response) => {
  const { q } = imageSearchQuerySchema.parse(req.query);
  const result = await getAIService().searchImages(q);
  res.json(result);
});
