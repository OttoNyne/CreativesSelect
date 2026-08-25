import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { extractYouTubeId } from "../utils/youtube";

const MAX_TRACKS = 5;

export async function listTracks(ownerId: string) {
  return prisma.track.findMany({ where: { ownerId }, orderBy: { position: "asc" } });
}

export async function addTrack(
  ownerId: string,
  input: { title: string; sourceType: "upload" | "youtube"; url: string },
) {
  const count = await prisma.track.count({ where: { ownerId } });
  if (count >= MAX_TRACKS) {
    throw new HttpError(400, `You can only have up to ${MAX_TRACKS} tracks`);
  }

  let url = input.url;
  if (input.sourceType === "youtube") {
    const videoId = extractYouTubeId(input.url);
    if (!videoId) throw new HttpError(400, "Couldn't parse a YouTube video from that link");
    url = videoId;
  }

  return prisma.track.create({
    data: { ownerId, title: input.title, sourceType: input.sourceType, url, position: count },
  });
}

export async function removeTrack(userId: string, trackId: string) {
  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) throw new HttpError(404, "Track not found");
  if (track.ownerId !== userId) throw new HttpError(403, "Not allowed to remove this track");
  await prisma.track.delete({ where: { id: trackId } });

  const remaining = await prisma.track.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } });
  await Promise.all(remaining.map((t, index) => prisma.track.update({ where: { id: t.id }, data: { position: index } })));
}
