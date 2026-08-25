import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getGroupById,
  getGroupMembers,
  getGroups,
  postGroup,
  postJoinGroup,
  postLeaveGroup,
} from "../controllers/groups.controller";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);
groupsRouter.get("/", getGroups);
groupsRouter.post("/", postGroup);
groupsRouter.get("/:id", getGroupById);
groupsRouter.post("/:id/join", postJoinGroup);
groupsRouter.post("/:id/leave", postLeaveGroup);
groupsRouter.get("/:id/members", getGroupMembers);
