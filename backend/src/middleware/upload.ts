import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

export const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");

const ALLOWED_PURPOSES = new Set(["avatars", "banners", "wallpapers", "portfolio", "tracks"]);
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
]);

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
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Unsupported file type"));
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
