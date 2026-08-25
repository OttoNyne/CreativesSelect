import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  acceptFriendRequest,
  declineFriendRequest,
  deleteFriend,
  getFriends,
  getIncomingRequests,
  postFriendRequest,
} from "../controllers/friends.controller";

export const friendsRouter = Router();

friendsRouter.use(requireAuth);
friendsRouter.get("/", getFriends);
friendsRouter.get("/requests", getIncomingRequests);
friendsRouter.post("/request/:username", postFriendRequest);
friendsRouter.post("/accept/:requestId", acceptFriendRequest);
friendsRouter.post("/decline/:requestId", declineFriendRequest);
friendsRouter.delete("/:friendId", deleteFriend);
