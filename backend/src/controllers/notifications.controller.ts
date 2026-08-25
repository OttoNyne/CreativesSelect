import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { listNotifications, markNotificationRead } from "../services/notifications.service";

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const notifications = await listNotifications(req.user!.id);
  res.json({ notifications });
});

export const postMarkRead = asyncHandler(async (req: Request, res: Response) => {
  await markNotificationRead(req.user!.id, req.params.id);
  res.status(204).send();
});
