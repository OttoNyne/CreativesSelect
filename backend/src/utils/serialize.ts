import type { Post, User } from "@prisma/client";

export function toPublicUser(user: User) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  let theme: Record<string, string> = {};
  try {
    theme = JSON.parse(user.theme);
  } catch {
    theme = {};
  }
  return { ...publicUser, theme };
}

export type PublicUser = ReturnType<typeof toPublicUser>;

export function toPublicPost(post: Post & { author: User; _count: { comments: number } }) {
  return {
    ...post,
    author: toPublicUser(post.author),
    commentCount: post._count.comments,
  };
}
