import { Request, Response } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { addMediaItem, deleteMediaItem, listMediaByUsername } from "../services/media.service";

function mediaTypeFromMime(mimetype: string): string {
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "image";
}

const PASS_THROUGH_FOLDERS = new Set(["avatars", "wallpapers", "tracks"]);

export const postUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new HttpError(400, "No file uploaded");
  const purpose = String(req.query.purpose ?? "portfolio");
  const folder = PASS_THROUGH_FOLDERS.has(purpose) ? purpose : "portfolio";
  const url = `/uploads/${folder}/${req.file.filename}`;

  if (purpose === "portfolio") {
    const mediaItem = await addMediaItem(req.user!.id, {
      url,
      type: mediaTypeFromMime(req.file.mimetype),
      caption: typeof req.body?.caption === "string" ? req.body.caption : undefined,
    });
    return res.status(201).json({ url, mediaItem });
  }

  res.status(201).json({ url });
});

export const getUserMedia = asyncHandler(async (req: Request, res: Response) => {
  const items = await listMediaByUsername(req.params.username);
  res.json({ media: items });
});

export const deleteMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteMediaItem(req.user!.id, req.params.id);
  res.status(204).send();
});
