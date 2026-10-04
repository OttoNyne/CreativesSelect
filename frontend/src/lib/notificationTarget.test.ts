import { describe, expect, it } from "vitest";
import { notificationTarget } from "./notificationTarget";
import type { Notification, User } from "../types";

const zoe = { id: "u2", username: "zoe", displayName: "Zoe" } as User;
const n = (type: Notification["type"], payload: Record<string, unknown> = {}, actor: User | null = zoe): Notification => ({
  id: "n1",
  recipientId: "me",
  type,
  payload,
  actor,
  isRead: false,
  createdAt: "",
});

describe("notificationTarget", () => {
  it("a comment goes to the post, pointing at the comment", () => {
    expect(notificationTarget(n("comment", { postId: "p1", commentId: "c 1" }), "me")).toEqual({ to: "/posts/p1?comment=c%201", label: "View post" });
    expect(notificationTarget(n("comment", { postId: "p1" }), "me")).toEqual({ to: "/posts/p1", label: "View post" });
  });

  it("a comment with no post recorded falls back to the commenter's profile", () => {
    expect(notificationTarget(n("comment", {}), "me")).toEqual({ to: "/u/zoe", label: "View profile" });
    expect(notificationTarget(n("comment", {}, null), "me")).toBeNull();
  });

  it("a message goes to the conversation with the sender", () => {
    expect(notificationTarget(n("message", { count: 2 }), "me")).toEqual({ to: "/messages/zoe", label: "Open conversation" });
    expect(notificationTarget(n("message", {}, null), "me")).toBeNull();
  });

  it("a testimonial goes to your own profile's testimonials, and nowhere if we don't know who you are", () => {
    expect(notificationTarget(n("profile_comment"), "ada")).toEqual({ to: "/u/ada#testimonials", label: "View testimonial" });
    expect(notificationTarget(n("profile_comment"), null)).toBeNull();
    expect(notificationTarget(n("profile_comment"), undefined)).toBeNull();
  });

  it("friend requests go to Friends; an accepted request goes to the new friend's profile", () => {
    expect(notificationTarget(n("friend_request"), "me")?.to).toBe("/friends");
    expect(notificationTarget(n("friend_accept"), "me")).toEqual({ to: "/u/zoe", label: "View profile" });
    expect(notificationTarget(n("friend_accept", {}, null), "me")).toBeNull();
  });

  it("help offers and acceptances go to Help wanted", () => {
    expect(notificationTarget(n("help_offer"), "me")?.to).toBe("/help-wanted");
    expect(notificationTarget(n("help_accepted"), "me")?.to).toBe("/help-wanted");
  });

  it("going live goes to the room, and nowhere without one", () => {
    expect(notificationTarget(n("live_started", { liveId: "l1" }), "me")).toEqual({ to: "/live/l1", label: "Listen live" });
    expect(notificationTarget(n("live_started", {}), "me")).toBeNull();
  });

  it("a group goes to the group, or the groups list", () => {
    expect(notificationTarget(n("group_invite", { groupId: "g1" }), "me")?.to).toBe("/groups/g1");
    expect(notificationTarget(n("group_invite"), "me")?.to).toBe("/groups");
  });

  it("ignores ids that aren't text", () => {
    expect(notificationTarget(n("comment", { postId: 42, commentId: {} }), "me")?.to).toBe("/u/zoe");
    expect(notificationTarget(n("live_started", { liveId: null }), "me")).toBeNull();
  });
});

describe("notificationTarget: invite links", () => {
  it("opens the profile of the person who joined, or the friends page if they are gone", () => {
    expect(notificationTarget(n("invite_joined", { inviteId: "i1" }), "me")).toEqual({ to: "/u/zoe", label: "View profile" });
    expect(notificationTarget(n("invite_joined", {}, null), "me")).toEqual({ to: "/friends", label: "See your friends" });
  });
});

describe("notificationTarget: blog entries", () => {
  it("opens the entry", () => {
    expect(notificationTarget(n("blog_post", { entryId: "e1" }), "me")).toEqual({ to: "/blog/e1", label: "Read entry" });
  });
  it("falls back to the author's profile when the entry isn't named", () => {
    expect(notificationTarget(n("blog_post", {}), "me")).toEqual({ to: "/u/zoe", label: "View profile" });
    expect(notificationTarget(n("blog_post", {}, null), "me")).toBeNull();
  });
});

describe("notificationTarget: planned lives", () => {
  it("announcements and reminders go to the Live page, where the schedule is", () => {
    expect(notificationTarget(n("live_scheduled", { scheduledId: "p1" }), "me")).toEqual({ to: "/live", label: "See upcoming lives" });
    expect(notificationTarget(n("live_reminder", { scheduledId: "p1" }), "me")).toEqual({ to: "/live", label: "Open Live" });
  });
});
