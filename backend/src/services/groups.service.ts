import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

export async function listGroups(search: string | undefined, viewerId: string) {
  const groups = await prisma.group.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { memberships: true } }, memberships: { where: { userId: viewerId } } },
  });
  return groups.map((g) => ({ ...g, isMember: g.memberships.length > 0 }));
}

export async function getGroup(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { _count: { select: { memberships: true } } },
  });
  if (!group) throw new HttpError(404, "Group not found");
  return group;
}

export async function createGroup(
  createdById: string,
  input: { name: string; description?: string; bannerUrl?: string | null },
) {
  const group = await prisma.group.create({
    data: {
      name: input.name,
      description: input.description,
      bannerUrl: input.bannerUrl ?? null,
      createdById,
    },
  });
  await prisma.groupMembership.create({
    data: { groupId: group.id, userId: createdById, role: "admin" },
  });
  return group;
}

export async function joinGroup(groupId: string, userId: string) {
  await getGroup(groupId);
  const existing = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (existing) throw new HttpError(409, "Already a member");
  return prisma.groupMembership.create({ data: { groupId, userId } });
}

export async function leaveGroup(groupId: string, userId: string) {
  await prisma.groupMembership.deleteMany({ where: { groupId, userId } });
}

export async function listMembers(groupId: string) {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  return memberships;
}
