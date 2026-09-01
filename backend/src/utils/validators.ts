import { z } from "zod";

// Accepts either an absolute URL or a relative path like "/uploads/avatars/xyz.png"
// (our own upload/AI endpoints return relative paths, not absolute URLs).
const mediaUrlSchema = z.string().refine(
  (value) => value.startsWith("/") || /^https?:\/\//.test(value),
  "Must be a relative path or absolute URL",
);

// CSS background-position value, e.g. "50% 50%" or "30% 70%".
const positionSchema = z.string().regex(/^-?\d{1,3}%\s-?\d{1,3}%$/, "Must be a position like \"50% 50%\"");

export const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(8).max(72),
  displayName: z.string().min(1).max(60),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(2000).optional(),
  avatarUrl: mediaUrlSchema.optional().nullable(),
  wallpaperUrl: mediaUrlSchema.optional().nullable(),
  wallpaperType: z.enum(["image", "video"]).optional(),
  wallpaperPosition: positionSchema.optional(),
  isPrivate: z.boolean().optional(),
  theme: z
    .object({
      bgColor: z.string().optional(),
      textColor: z.string().optional(),
      accentColor: z.string().optional(),
      fontFamily: z.string().optional(),
      layoutStyle: z.string().optional(),
    })
    .optional(),
});

export const topFriendsSchema = z.object({
  usernames: z.array(z.string()).max(8),
});

export const createPostSchema = z.object({
  content: z.string().min(1).max(3000),
  imageUrl: mediaUrlSchema.optional().nullable(),
  isAiText: z.boolean().optional(),
  isAiImage: z.boolean().optional(),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

export const createGroupSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  bannerUrl: mediaUrlSchema.optional().nullable(),
});

export const reportSchema = z.object({
  targetType: z.enum(["user", "post", "comment", "profileComment"]),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

export const aiTextRequestSchema = z.object({
  prompt: z.string().max(2000),
  kind: z.enum(["bio", "caption", "blurb"]),
});

export const aiImageRequestSchema = z.object({
  prompt: z.string().max(2000),
  kind: z.enum(["avatar", "wallpaper", "post"]),
  live: z.boolean().optional(),
});

export const imageSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

// For adding a media item from a URL (AI-generated or picked from image
// search) rather than a direct file upload.
export const createMediaItemSchema = z.object({
  url: mediaUrlSchema,
  type: z.enum(["image", "audio", "video"]).default("image"),
  caption: z.string().max(200).optional(),
  isAiImage: z.boolean().optional(),
});

export const createTrackSchema = z.object({
  title: z.string().min(1).max(100),
  sourceType: z.enum(["upload", "youtube"]),
  url: z.string().min(1).max(2000),
});
