import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { createPost, deletePost, getFeedForUser, getPostsByUsername } from "../services/posts.service";
import { toPublicPost } from "../utils/serialize";
import { createPostSchema } from "../utils/validators";

export const getFeed = asyncHandler(async (req: Request, res: Response) => {
  const posts = await getFeedForUser(req.user!.id);
  res.json({ posts: posts.map(toPublicPost) });
});

export const getUserPosts = asyncHandler(async (req: Request, res: Response) => {
  const posts = await getPostsByUsername(req.params.username);
  res.json({ posts: posts.map(toPublicPost) });
});

export const postPost = asyncHandler(async (req: Request, res: Response) => {
  const input = createPostSchema.parse(req.body);
  const post = await createPost(req.user!.id, input);
  res.status(201).json({ post: toPublicPost(post) });
});

export const deletePostHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePost(req.user!.id, req.params.id);
  res.status(204).send();
});
