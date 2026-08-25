import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getNotifications, postMarkRead } from "../controllers/notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", getNotifications);
notificationsRouter.post("/:id/read", postMarkRead);
