import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { addTrack, listTracks, removeTrack } from "../services/tracks.service";
import { getProfileForViewer } from "../services/profile.service";
import { createTrackSchema } from "../utils/validators";

export const getUserTracks = asyncHandler(async (req: Request, res: Response) => {
  const owner = await getProfileForViewer(req.params.username, req.user?.id);
  const tracks = await listTracks(owner.id);
  res.json({ tracks });
});

export const postTrack = asyncHandler(async (req: Request, res: Response) => {
  const input = createTrackSchema.parse(req.body);
  const track = await addTrack(req.user!.id, input);
  res.status(201).json({ track });
});

export const deleteTrack = asyncHandler(async (req: Request, res: Response) => {
  await removeTrack(req.user!.id, req.params.id);
  res.status(204).send();
});
