import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getNotifications, postMarkAllRead, postMarkRead } from "../controllers/notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", getNotifications);
notificationsRouter.post("/read-all", postMarkAllRead);
notificationsRouter.post("/:id/read", postMarkRead);
