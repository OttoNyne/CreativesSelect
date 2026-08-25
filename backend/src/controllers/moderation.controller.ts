import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { blockUser, fileReport, unblockUser } from "../services/moderation.service";
import { reportSchema } from "../utils/validators";

export const postBlock = asyncHandler(async (req: Request, res: Response) => {
  await blockUser(req.user!.id, req.params.username);
  res.status(204).send();
});

export const deleteBlock = asyncHandler(async (req: Request, res: Response) => {
  await unblockUser(req.user!.id, req.params.username);
  res.status(204).send();
});

export const postReport = asyncHandler(async (req: Request, res: Response) => {
  const input = reportSchema.parse(req.body);
  const report = await fileReport(req.user!.id, input);
  res.status(201).json({ report });
});
