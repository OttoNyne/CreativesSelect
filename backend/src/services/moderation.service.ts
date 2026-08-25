import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

export async function blockUser(blockerId: string, blockedUsername: string) {
  const blocked = await prisma.user.findUnique({ where: { username: blockedUsername } });
  if (!blocked) throw new HttpError(404, "User not found");
  if (blocked.id === blockerId) throw new HttpError(400, "Cannot block yourself");

  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: blockerId, addresseeId: blocked.id },
        { requesterId: blocked.id, addresseeId: blockerId },
      ],
    },
  });

  return prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId: blocked.id } },
    update: {},
    create: { blockerId, blockedId: blocked.id },
  });
}

export async function unblockUser(blockerId: string, blockedUsername: string) {
  const blocked = await prisma.user.findUnique({ where: { username: blockedUsername } });
  if (!blocked) throw new HttpError(404, "User not found");
  await prisma.block.deleteMany({ where: { blockerId, blockedId: blocked.id } });
}

export async function fileReport(
  reporterId: string,
  input: { targetType: string; targetId: string; reason: string },
) {
  return prisma.report.create({
    data: {
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
    },
  });
}
