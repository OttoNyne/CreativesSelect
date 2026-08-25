import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { deletePostHandler, getFeed, getUserPosts, postPost } from "../controllers/posts.controller";

export const postsRouter = Router();

postsRouter.use(requireAuth);
postsRouter.get("/feed", getFeed);
postsRouter.get("/user/:username", getUserPosts);
postsRouter.post("/", postPost);
postsRouter.delete("/:id", deletePostHandler);
