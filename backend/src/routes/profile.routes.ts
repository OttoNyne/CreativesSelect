import { Router } from "express";
import { attachUserIfPresent, requireAuth } from "../middleware/auth";
import {
  deleteProfileCommentHandler,
  getProfile,
  getProfileComments,
  getSearchUsers,
  getTopFriends,
  patchOwnProfile,
  postProfileComment,
  putTopFriends,
} from "../controllers/profile.controller";

export const profileRouter = Router();

profileRouter.get("/", requireAuth, getSearchUsers);
profileRouter.patch("/me", requireAuth, patchOwnProfile);
profileRouter.put("/me/top-friends", requireAuth, putTopFriends);
profileRouter.delete("/comments/:commentId", requireAuth, deleteProfileCommentHandler);

profileRouter.get("/:username", attachUserIfPresent, getProfile);
profileRouter.get("/:username/top-friends", getTopFriends);
profileRouter.get("/:username/comments", getProfileComments);
profileRouter.post("/:username/comments", requireAuth, postProfileComment);
