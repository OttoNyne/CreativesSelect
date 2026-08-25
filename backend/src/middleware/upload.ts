import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

export const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");

const ALLOWED_PURPOSES = new Set(["avatars", "banners", "wallpapers", "portfolio", "tracks"]);

const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const AUDIO_MIME = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"];
const VIDEO_MIME = ["video/mp4", "video/webm"];

// Only "wallpapers" accepts video, so a static avatar/banner upload can't
// smuggle in a video file just because video mimetypes exist elsewhere.
const PURPOSE_MIME: Record<string, string[]> = {
  avatars: IMAGE_MIME,
  banners: IMAGE_MIME,
  wallpapers: [...IMAGE_MIME, ...VIDEO_MIME],
  portfolio: IMAGE_MIME,
  tracks: AUDIO_MIME,
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const purpose = String(req.query.purpose ?? "portfolio");
    const folder = ALLOWED_PURPOSES.has(purpose) ? purpose : "portfolio";
    const dest = path.join(UPLOADS_ROOT, folder);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const purpose = String(req.query.purpose ?? "portfolio");
    const allowed = PURPOSE_MIME[purpose] ?? IMAGE_MIME;
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Unsupported file type for this upload"));
      return;
    }
    cb(null, true);
  },
});

export function ensureUploadDirs() {
  for (const folder of [...ALLOWED_PURPOSES, "ai-generated"]) {
    fs.mkdirSync(path.join(UPLOADS_ROOT, folder), { recursive: true });
  }
}
