import type { SectionKey } from "./lib/sections";

/** How recently someone was active: within minutes, today, or this week. */
export type Activity = "online" | "today" | "week";

/** How a picture wallpaper moves behind a profile. */
export type WallpaperMotion = "none" | "zoom" | "drift" | "pan" | "pulse";

export interface ProfileTheme {
  bgColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
  /** An older setting that no longer does anything. */
  layoutStyle?: string;
  /** How the profile is styled: a choice from a fixed list for each (see lib/profileStyle.ts). */
  cardStyle?: string;
  corners?: string;
  density?: string;
  headings?: string;
  avatarShape?: string;
  width?: string;
}

export interface User {
  id: string;
  /** Only present on your own user object. */
  email?: string;
  /** Whether you've opened the link we emailed to confirm the address. Only on your own user object. */
  emailVerified?: boolean;
  /** The language the site emails you in: the one you use it in. Only on your own user object. */
  language?: "en" | "es" | "ar";
  /** Whether they take commissions and collaborations, what they offer (up to five words) and a short note. */
  openToWork?: boolean;
  workOffers?: string[];
  /** How many follow them, how many they follow, and whether you follow them (shown where the whole profile is). */
  followerCount?: number;
  followingCount?: number;
  iFollow?: boolean;
  /** What the profile puts first: the post pinned to the top (shown where the whole profile is). */
  pinnedPost?: Post | null;
  workNote?: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  wallpaperUrl: string | null;
  wallpaperType: "image" | "video";
  wallpaperPosition: string;
  /** How a picture wallpaper moves; absent on profiles saved before wallpapers could move (treated as "none"). */
  wallpaperMotion?: WallpaperMotion;
  /** Shows the CSverified badge: given by an administrator, or earned with 1,000 active friends. */
  csVerified?: boolean;
  /** A short status line, what they are listening to, and what they do (lower-case tags). Absent on a private profile you can't see. */
  mood?: string;
  listeningTo?: string;
  tags?: string[];
  /** The order of the sections below the introduction, and the ones the owner has hidden from visitors. */
  sectionOrder?: SectionKey[];
  hiddenSections?: SectionKey[];
  /** How recently a friend was around, in rough terms; only ever present for a friend who allows it. */
  activity?: Activity;
  /** On your own profile: whether your friends can see when you're online. */
  showActivity?: boolean;
  /** On your own profile: whether profile views are on (off by default). */
  profileViews?: boolean;
  /** Only in your own: whether you may be named as a mutual friend and suggested to friends of friends. */
  showConnections?: boolean;
  listInSearchEngines?: boolean;
  /** Only in your own: whether friends see when you've read their messages and when you're typing (and you see theirs). */
  chatStatus?: boolean;
  /** On your own profile: whether you are a moderator of the site. */
  isAdmin?: boolean;
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
  /** How the picture is framed; null on posts made before framing existed. */
  imageAspect?: "original" | "1:1" | "4:3" | "16:9" | null;
  imageZoom?: number | null;
  imagePosition?: string | null;
  /** The author's description of the picture, for people who can't see it. */
  imageAlt?: string;
  /** Whether its author has pinned it to the top of their profile. */
  pinned?: boolean;
  isAiText: boolean;
  isAiImage: boolean;
  createdAt: string;
  /** When its author last changed the words; null if never. */
  editedAt?: string | null;
  commentCount: number;
  /** The emoji reactions on it, and the signed-in viewer's own. */
  reactions?: ReactionSummary;
  /** A repost shares another post (`repost`), with or without words of its own. */
  isRepost?: boolean;
  repost?: SharedPostView | null;
  /** Whether the signed-in viewer has saved it. */
  saved?: boolean;
}

/** The post a repost shares: the whole thing while it can still be shown, or just that it can't. */
export type SharedPostView =
  | { available: false }
  | { available: true; id: string; authorId: string; author: User; content: string; imageUrl: string | null; imageAspect?: "original" | "1:1" | "4:3" | "16:9" | null; imageZoom?: number | null; imagePosition?: string | null; imageAlt?: string; createdAt: string };

export interface Comment {
  id: string;
  /** The words (may be empty when there is a picture). */
  content: string;
  /** One picture or GIF the author uploaded, if any. */
  imageUrl?: string | null;
  createdAt: string;
  editedAt?: string | null;
  /** The top-level comment this is a reply to (absent or null for a comment that isn't a reply). */
  parent?: string | null;
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
  /** How many friends the person asking has in common with you. */
  mutualCount?: number;
}

/** The friends you share with someone: how many, and up to eight of them. */
export interface ProfileMutual {
  count: number;
  friends: User[];
}

/** A person you may know: how many friends you share, and who (up to three). */
export interface FriendSuggestion {
  user: User;
  mutualCount: number;
  mutual: User[];
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
  /** Your place in it: admin, member, or null if you haven't joined. */
  myRole?: "admin" | "member" | null;
}

export interface GroupMember {
  role: string;
  joinedAt: string;
  user: User;
}

/** A named group of portfolio pieces. */
export interface Album {
  id: string;
  title: string;
  count: number;
}

/** The six emoji reactions on pictures and posts. */
export type ReactionKey = "like" | "love" | "laugh" | "wow" | "sad" | "fire";

/** How many of each reaction a picture or post has, the total, and the signed-in viewer's own (null if none). */
export interface ReactionSummary {
  counts: Record<ReactionKey, number>;
  total: number;
  mine: ReactionKey | null;
}

export interface MediaItem {
  id: string;
  ownerId: string;
  url: string;
  type: "image" | "audio" | "video" | "embed";
  caption: string | null;
  isAiImage: boolean;
  /** Videos: where playback starts (linked videos play as a one-minute window from here). */
  startSeconds?: number;
  /** Uploaded videos: measured length in seconds. */
  durationSeconds?: number | null;
  /** The album this piece is in, if any. */
  albumId?: string | null;
  /** Whether the signed-in viewer has saved it. */
  saved?: boolean;
  /** Whether its owner features it (it comes first in the portfolio). */
  featured?: boolean;
  /** The emoji reactions on it, and the signed-in viewer's own. */
  reactions: ReactionSummary;
  /** How many comments the piece has. */
  commentCount?: number;
  /** The people credited on it (accepted ones to everybody; waiting ones only to the owner and the person asked). */
  credits?: MediaCredit[];
  createdAt: string;
}

/** Someone credited on a portfolio piece, with what they did. */
export interface MediaCredit {
  id: string;
  itemId: string;
  role: string;
  status: "pending" | "accepted";
  user: { id: string; username: string; displayName: string; avatarUrl: string | null; csVerified: boolean };
}

/** A piece made by someone else that a person is credited on, or a credit waiting to be accepted. */
export interface CreditedPiece {
  id: string;
  role: string;
  item: MediaItem;
  owner: MediaCredit["user"];
  createdAt: string;
}

export interface Track {
  id: string;
  ownerId: string;
  title: string;
  /** Who made it (may be empty). */
  artist?: string;
  sourceType: "upload" | "youtube";
  url: string;
  position: number;
  /** The one song that stands for the profile. It never plays by itself. */
  profileSong?: boolean;
  /** How many listeners have played it. */
  plays?: number;
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

/** Someone who looked at your profile, and the day they last did (a calendar day, in UTC). */
export interface ProfileVisitor {
  user: User;
  day: string;
}

/** What a report is about, as shown to a moderator. */
export interface ModerationTarget {
  type: string;
  author: User | null;
  title?: string;
  text?: string;
  image?: string | null;
  link?: string | null;
}

/** Everything reported about one thing. */
export interface ModerationCase {
  targetType: string;
  targetId: string;
  exists: boolean;
  target: ModerationTarget | null;
  count: number;
  reports: { id: string; reason: string; createdAt: string; reporter: User | null }[];
}

/** A moderator's decision, as kept in the record. */
export interface AdminAction {
  id: string;
  targetType: string;
  targetId: string;
  action: string;
  note: string;
  reportCount: number;
  createdAt: string;
  admin: User | null;
  subject: User | null;
}

export interface SuspendedAccount {
  user: User;
  suspendedAt: string;
  note: string;
}

export type OnboardingStepKey = "email" | "avatar" | "bio" | "portfolio" | "friend" | "post";

/** The getting-started checklist: each step ticked from what the person has really done. */
export interface OnboardingState {
  steps: { key: OnboardingStepKey; done: boolean }[];
  allDone: boolean;
  dismissed: boolean;
  /** Whether to show it: a recent account, not finished, not hidden. */
  show: boolean;
}

/** Who is inviting someone, as shown on an invite link. */
export interface Inviter {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** A link someone shares so a friend can join and be their friend straight away. */
export interface Invite {
  id: string;
  code: string;
  uses: number;
  maxUses: number;
  expiresAt: string;
  createdAt: string;
  joined: { user: User; at: string }[];
}

/** A short message from someone to all of their friends; it comes down after a while. */
export interface Bulletin {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  expiresAt: string;
  isMine: boolean;
  author: User;
}

/** An entry in a list: the start of it, not the whole text. */
export interface BlogSummary {
  id: string;
  title: string;
  excerpt: string;
  createdAt: string;
  updatedAt: string;
  /** How many comments the entry has. */
  commentCount?: number;
}

export interface BlogEntry {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  isAuthor: boolean;
  author: User;
  /** How many comments the entry has. */
  commentCount?: number;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: "friend_request" | "friend_accept" | "comment" | "profile_comment" | "group_invite" | "help_offer" | "help_accepted" | "live_started" | "message" | "live_scheduled" | "live_reminder" | "blog_post" | "invite_joined" | "report_resolved" | "content_removed" | "media_comment" | "event_created" | "event_updated" | "event_cancelled" | "event_reminder" | "friend_birthday" | "blog_comment" | "cs_verified" | "credit_request" | "credit_accepted" | "work_request" | "work_reply" | "mention" | "follow" | "repost" | "reply" | "reaction";
  payload: Record<string, unknown>;
  actor: User | null;
  /** Only present for type "friend_request" — the underlying Friendship's
   *  current status, so Accept/Decline can be hidden once already resolved. */
  friendshipStatus?: "pending" | "accepted" | "declined" | null;
  isRead: boolean;
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  /** True when the signed-in user sent it. */
  mine: boolean;
  body: string;
  readAt: string | null;
  createdAt: string;
  editedAt?: string | null;
}

export interface Conversation {
  user: User;
  lastMessage: DirectMessage | null;
  unread: number;
}

/** A discussion topic on a group's board. */
export interface GroupTopic {
  id: string;
  groupId: string;
  title: string;
  body: string;
  pinned: boolean;
  replyCount: number;
  createdAt: string;
  lastActivityAt: string;
  /** True when the signed-in person started it. */
  mine: boolean;
  editedAt?: string | null;
  author: User | null;
}

/** A reply in a topic on a group's board. */
export interface GroupReply {
  id: string;
  topicId: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  mine: boolean;
  author: User | null;
}

export interface GroupChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  sender: User | null;
  /** True when the signed-in user sent it. */
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface LiveRoom {
  id: string;
  title: string;
  status: "live" | "ended";
  startedAt: string;
  host: User;
  isHost: boolean;
  listenerCount: number;
  maxListeners: number;
  /** How the audio travels: straight between browsers (a few listeners) or through a media server (50-100). */
  mode?: "mesh" | "sfu";
  /** How often this room's clients should check in, and poll the chat. */
  heartbeatMs?: number;
  commentPollMs?: number;
  /** How many listeners the host can bring on stage to speak; 0 when this live has no stage. */
  maxGuests?: number;
}

/** A listener's place on the stage: listening, asking to speak, invited by the host, or speaking. */
export type StageState = "listener" | "requested" | "invited" | "speaking";

/** The stage of a live. `requests`, `invited` and `listeners` are only sent to the host. */
export interface LiveStage {
  enabled: boolean;
  maxGuests: number;
  /** The viewer's own place (null for the host). */
  me: StageState | null;
  /** Everyone speaking now. */
  guests: { user: User }[];
  requests?: { user: User }[];
  invited?: { user: User }[];
  /** Everyone else listening, for the host to pick from. */
  listeners?: { user: User }[];
}

/** A live a host has planned for later. */
export interface ScheduledLive {
  id: string;
  title: string;
  startsAt: string;
  host: User;
  isHost: boolean;
  /** Whether the viewer asked to be reminded. */
  reminding: boolean;
  reminderCount: number;
}

/** Someone's About me, as much of it as the viewer may see. */
export interface ProfileAbout {
  about: { interests: string; music: string; movies: string; books: string; meet: string };
  /** Empty when there is none or the viewer may not see it. */
  location: string;
  /** Month and day only, shown to the owner and their friends. */
  birthday: { month: number; day: number } | null;
  /** Only in your own: who may see your location. */
  locationAudience?: "friends" | "everyone";
}

export type EventAnswer = "going" | "maybe";

/** Something a person is organising for a date. (Not called Event: that is the browser's own.) */
export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  kind: "in_person" | "online";
  place: string;
  link: string;
  audience: "friends" | "public";
  editedAt: string | null;
  host: User;
  isHost: boolean;
  /** The viewer's own answer. */
  myStatus: EventAnswer | null;
  goingCount: number;
  maybeCount: number;
}

export interface LiveComment {
  id: string;
  userId: string;
  user: User | null;
  /** True when the signed-in user wrote it. */
  mine: boolean;
  body: string;
  createdAt: string;
}

/** A request for work: what someone asks of a person who is open to work, and how they answered. */
export interface WorkRequest {
  id: string;
  title: string;
  details: string;
  budget: string;
  deadline: string | null;
  status: "open" | "accepted" | "declined";
  reply: string;
  answeredAt: string | null;
  createdAt: string;
  /** Who sent it (in what you have received) or who it was sent to (in what you have sent). */
  from?: { id: string; username: string; displayName: string; avatarUrl: string | null; csVerified: boolean };
  to?: { id: string; username: string; displayName: string; avatarUrl: string | null; csVerified: boolean };
}

/** One week of the weekly creative challenge: its key (like 2026-W41), when it opens and closes, and its prompt in the language asked for. */
export interface ChallengeWeek {
  key: string;
  startsAt: string;
  endsAt: string;
  prompt: string;
}

/** A piece someone entered in a week's challenge. */
export interface ChallengeEntry {
  id: string;
  item: MediaItem;
  owner: MediaCredit["user"];
  createdAt: string;
}
