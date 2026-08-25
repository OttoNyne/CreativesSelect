import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { UPLOADS_ROOT } from "./middleware/upload";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth.routes";
import { profileRouter } from "./routes/profile.routes";
import { postsRouter } from "./routes/posts.routes";
import { commentsRouter } from "./routes/comments.routes";
import { friendsRouter } from "./routes/friends.routes";
import { groupsRouter } from "./routes/groups.routes";
import { mediaRouter } from "./routes/media.routes";
import { notificationsRouter } from "./routes/notifications.routes";
import { moderationRouter } from "./routes/moderation.routes";
import { aiRouter } from "./routes/ai.routes";

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  if (env.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.use("/uploads", express.static(UPLOADS_ROOT));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/profiles", profileRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api", commentsRouter);
  app.use("/api/friends", friendsRouter);
  app.use("/api/groups", groupsRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api", moderationRouter);
  app.use("/api/ai", aiRouter);

  app.use(errorHandler);

  return app;
}
