import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { deleteMediaHandler, getUserMedia, postUpload } from "../controllers/media.controller";

export const mediaRouter = Router();

mediaRouter.post("/upload", requireAuth, upload.single("file"), postUpload);
mediaRouter.get("/user/:username", getUserMedia);
mediaRouter.delete("/:id", requireAuth, deleteMediaHandler);
