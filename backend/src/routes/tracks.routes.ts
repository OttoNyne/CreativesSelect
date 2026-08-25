import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { deleteTrack, postTrack } from "../controllers/tracks.controller";

export const tracksRouter = Router();

tracksRouter.use(requireAuth);
tracksRouter.post("/", postTrack);
tracksRouter.delete("/:id", deleteTrack);
