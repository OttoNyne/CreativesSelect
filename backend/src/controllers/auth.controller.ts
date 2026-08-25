import { Request, Response } from "express";
import { AUTH_COOKIE_NAME, signAuthToken } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { registerUser, verifyCredentials } from "../services/auth.service";
import { prisma } from "../lib/prisma";
import { loginSchema, registerSchema } from "../utils/validators";
import { toPublicUser } from "../utils/serialize";

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);
  const token = signAuthToken({ id: user.id, username: user.username });
  setAuthCookie(res, token);
  res.status(201).json({ user: toPublicUser(user) });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const user = await verifyCredentials(input.email, input.password);
  const token = signAuthToken({ id: user.id, username: user.username });
  setAuthCookie(res, token);
  res.json({ user: toPublicUser(user) });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new HttpError(401, "Not authenticated");
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    throw new HttpError(401, "Not authenticated");
  }
  res.json({ user: toPublicUser(user) });
});
