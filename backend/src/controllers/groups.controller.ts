import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { createGroup, getGroup, joinGroup, leaveGroup, listGroups, listMembers } from "../services/groups.service";
import { toPublicUser } from "../utils/serialize";
import { createGroupSchema } from "../utils/validators";

export const getGroups = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const groups = await listGroups(search, req.user!.id);
  res.json({
    groups: groups.map(({ memberships: _memberships, _count, ...g }) => ({ ...g, memberCount: _count.memberships })),
  });
});

export const postGroup = asyncHandler(async (req: Request, res: Response) => {
  const input = createGroupSchema.parse(req.body);
  const group = await createGroup(req.user!.id, input);
  res.status(201).json({ group });
});

export const getGroupById = asyncHandler(async (req: Request, res: Response) => {
  const group = await getGroup(req.params.id);
  res.json({ group: { ...group, memberCount: group._count.memberships } });
});

export const postJoinGroup = asyncHandler(async (req: Request, res: Response) => {
  const membership = await joinGroup(req.params.id, req.user!.id);
  res.status(201).json({ membership });
});

export const postLeaveGroup = asyncHandler(async (req: Request, res: Response) => {
  await leaveGroup(req.params.id, req.user!.id);
  res.status(204).send();
});

export const getGroupMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await listMembers(req.params.id);
  res.json({ members: members.map((m) => ({ role: m.role, joinedAt: m.joinedAt, user: toPublicUser(m.user) })) });
});
