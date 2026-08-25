import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const SALT_ROUNDS = 12;

export async function registerUser(input: {
  email: string;
  username: string;
  password: string;
  displayName: string;
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
  });
  if (existing) {
    throw new HttpError(409, "Email or username already in use");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash,
      displayName: input.displayName,
    },
  });
  return user;
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, "Invalid email or password");
  }
  return user;
}
