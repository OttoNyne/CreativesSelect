export interface ProfileTheme {
  bgColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
  layoutStyle?: string;
}

export interface User {
  id: string;
  /** Only present on your own user object. */
  email?: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  wallpaperUrl: string | null;
  wallpaperType: "image" | "video";
  wallpaperPosition: string;
  isPrivate: boolean;
  createdAt: string;
  theme: ProfileTheme;
}

export interface Post {
  id: string;
  authorId: string;
  author: User;
  content: string;
  imageUrl: string | null;
  isAiText: boolean;
  isAiImage: boolean;
  createdAt: string;
  commentCount: number;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: User;
}

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  createdAt: string;
  requester: User;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  createdById: string;
  createdAt: string;
  memberCount: number;
  isMember: boolean;
}

export interface GroupMember {
  role: string;
  joinedAt: string;
  user: User;
}

export interface MediaItem {
  id: string;
  ownerId: string;
  url: string;
  type: string;
  caption: string | null;
  isAiImage: boolean;
  createdAt: string;
}

export interface Track {
  id: string;
  ownerId: string;
  title: string;
  sourceType: "upload" | "youtube";
  url: string;
  position: number;
  createdAt: string;
}

export interface ImageSearchResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  creator?: string;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  isPublic?: boolean;
  done: boolean;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardTask {
  _id: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  createdAt: string;
  author: User;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: "friend_request" | "friend_accept" | "comment" | "profile_comment" | "group_invite" | "help_offer" | "help_accepted";
  payload: Record<string, unknown>;
  actor: User | null;
  /** Only present for type "friend_request" — the underlying Friendship's
   *  current status, so Accept/Decline can be hidden once already resolved. */
  friendshipStatus?: "pending" | "accepted" | "declined" | null;
  isRead: boolean;
  createdAt: string;
}
