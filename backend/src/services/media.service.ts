import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

export async function addMediaItem(
  ownerId: string,
  input: { url: string; type: string; caption?: string; isAiImage?: boolean },
) {
  return prisma.mediaItem.create({
    data: {
      ownerId,
      url: input.url,
      type: input.type,
      caption: input.caption,
      isAiImage: input.isAiImage ?? false,
    },
  });
}

export async function listMediaByUsername(username: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new HttpError(404, "User not found");
  return prisma.mediaItem.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } });
}

export async function deleteMediaItem(userId: string, mediaId: string) {
  const item = await prisma.mediaItem.findUnique({ where: { id: mediaId } });
  if (!item) throw new HttpError(404, "Media item not found");
  if (item.ownerId !== userId) throw new HttpError(403, "Not allowed to delete this item");
  await prisma.mediaItem.delete({ where: { id: mediaId } });
}
