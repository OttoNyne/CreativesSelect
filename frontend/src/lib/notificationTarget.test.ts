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

  it("a comment on a portfolio piece opens that piece and comment on your own profile", () => {
    expect(notificationTarget(n("media_comment", { mediaId: "m1", commentId: "c1" }), "ada")).toEqual({ to: "/u/ada?piece=m1&comment=c1#portfolio", label: "View comment" });
    expect(notificationTarget(n("media_comment", { mediaId: "m1" }), "ada")?.to).toBe("/u/ada?piece=m1#portfolio");
    expect(notificationTarget(n("media_comment", {}), "ada")).toEqual({ to: "/u/ada#portfolio", label: "View portfolio" });
    expect(notificationTarget(n("media_comment", { mediaId: "m1" }), null)).toBeNull();
  });

  it("an event opens it, and a cancelled one opens the list", () => {
    for (const type of ["event_created", "event_updated", "event_reminder"] as const) {
      expect(notificationTarget(n(type, { eventId: "e1" }), "ada")).toEqual({ to: "/events/e1", label: "View event" });
      expect(notificationTarget(n(type, {}), "ada")).toEqual({ to: "/events", label: "See events" });
    }
    expect(notificationTarget(n("event_cancelled", { title: "x" }), "ada")).toEqual({ to: "/events", label: "See events" });
  });

  it("a friend's birthday opens their profile", () => {
    expect(notificationTarget(n("friend_birthday"), "me")).toEqual({ to: "/u/zoe", label: "View profile" });
    expect(notificationTarget(n("friend_birthday", {}, null), "me")).toBeNull();
  });

  it("a reaction opens the post, or the picture on your own profile, and falls back to the person", () => {
    expect(notificationTarget(n("reaction", { targetType: "post", targetId: "p1", emoji: "like" }), "ada")).toEqual({ to: "/posts/p1", label: "View post" });
    expect(notificationTarget(n("reaction", { targetType: "media", targetId: "m 1", emoji: "like" }), "ada")).toEqual({ to: "/u/ada?piece=m%201#portfolio", label: "View piece" });
    expect(notificationTarget(n("reaction", { targetType: "media", targetId: "m1" }), undefined)).toEqual({ to: "/u/zoe", label: "View profile" });
    expect(notificationTarget(n("reaction", {}), "ada")).toEqual({ to: "/u/zoe", label: "View profile" });
  });

  it("being CSverified opens your own profile, and has nothing to open without one", () => {
    expect(notificationTarget(n("cs_verified", { reason: "admin" }, null), "ada")).toEqual({ to: "/u/ada", label: "View your profile" });
    expect(notificationTarget(n("cs_verified", {}, null), undefined)).toBeNull();
  });

  it("a comment on your blog entry opens the entry at that comment", () => {
    expect(notificationTarget(n("blog_comment", { entryId: "e1", commentId: "c1" }), "ada")).toEqual({ to: "/blog/e1?comment=c1", label: "View comment" });
    expect(notificationTarget(n("blog_comment", { entryId: "e1" }), "ada")?.to).toBe("/blog/e1");
    expect(notificationTarget(n("blog_comment", {}), "ada")).toEqual({ to: "/u/zoe", label: "View profile" });
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

describe("notificationTarget: moderation", () => {
  it("has nowhere to send a report thank-you or a removal notice", () => {
    expect(notificationTarget(n("report_resolved", { outcome: "action_taken" }, null), "me")).toBeNull();
    expect(notificationTarget(n("content_removed", { what: "post" }, null), "me")).toBeNull();
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

describe("credits", () => {
  it("a request opens your portfolio, where it can be answered; an acceptance opens the piece", () => {
    expect(notificationTarget(n("credit_request", { itemId: "m1", creditId: "c1", role: "Producer" }), "ada")).toEqual({ to: "/u/ada#portfolio", label: "View credit" });
    expect(notificationTarget(n("credit_accepted", { itemId: "m 1" }), "ada")).toEqual({ to: "/u/ada?piece=m%201#portfolio", label: "View credit" });
    expect(notificationTarget(n("credit_accepted", {}), "ada")).toEqual({ to: "/u/ada#portfolio", label: "View credit" });
    expect(notificationTarget(n("credit_request", {}), undefined)).toBeNull();
  });
});

describe("work requests", () => {
  it("a request, or an answer to one, opens the requests on your own profile", () => {
    expect(notificationTarget(n("work_request", { requestId: "r1", title: "A logo" }), "ada")).toEqual({ to: "/u/ada#work", label: "View requests" });
    expect(notificationTarget(n("work_reply", { requestId: "r1", accepted: true }), "ada")).toEqual({ to: "/u/ada#work", label: "View answer" });
    expect(notificationTarget(n("work_request", {}), undefined)).toBeNull();
  });
});

describe("notificationTarget: mentions", () => {
  it("goes to the place the server says, when that is an address inside the site", () => {
    expect(notificationTarget(n("mention", { url: "/posts/p1?comment=c1" }), "ada")).toEqual({ to: "/posts/p1?comment=c1", label: "See where" });
    expect(notificationTarget(n("mention", { url: "/u/zoe?piece=m1&comment=c2#portfolio" }), "ada")?.to).toBe("/u/zoe?piece=m1&comment=c2#portfolio");
  });
  it("never follows an address that could lead to another site, and falls back to the person who mentioned you", () => {
    for (const url of ["//evil.example/x", "https://evil.example", "javascript:alert(1)", "posts/1", "/a\\b", "", undefined]) {
      expect(notificationTarget(n("mention", { url }), "ada"), String(url)).toEqual({ to: "/u/zoe", label: "View profile" });
    }
    expect(notificationTarget(n("mention", {}, null), "ada")).toBeNull();
  });
});

describe("notificationTarget: follows", () => {
  it("opens the profile of the person who followed", () => {
    expect(notificationTarget(n("follow", {}), "ada")).toEqual({ to: "/u/zoe", label: "View profile" });
    expect(notificationTarget(n("follow", {}, null), "ada")).toBeNull();
  });
});

describe("notificationTarget: shares", () => {
  it("opens the post that shares yours", () => {
    expect(notificationTarget(n("repost", { postId: "p9" }), "ada")).toEqual({ to: "/posts/p9", label: "View post" });
    expect(notificationTarget(n("repost", {}), "ada")).toEqual({ to: "/u/zoe", label: "View profile" });
  });
});

describe("notificationTarget: replies", () => {
  it("opens the place the server names, inside the site only", () => {
    expect(notificationTarget(n("reply", { url: "/posts/p1?comment=c2" }), "ada")).toEqual({ to: "/posts/p1?comment=c2", label: "View reply" });
    for (const url of ["//evil.example", "https://evil.example", "posts/1", "", undefined]) {
      expect(notificationTarget(n("reply", { url }), "ada"), String(url)).toEqual({ to: "/u/zoe", label: "View profile" });
    }
  });
});

describe("notificationTarget: open calls", () => {
  it("opens the call, or the list when no call is named", () => {
    for (const type of ["call_match", "call_application", "call_answer"] as const) {
      expect(notificationTarget(n(type, { callId: "c 1" }), "ada")).toEqual({ to: "/calls/c%201", label: "View call" });
      expect(notificationTarget(n(type, {}), "ada")).toEqual({ to: "/calls", label: "View call" });
    }
  });
});

describe("notificationTarget: project rooms", () => {
  it("opens the room, or the list when none is named", () => {
    expect(notificationTarget(n("project_message", { projectId: "r 1" }), "ada")).toEqual({ to: "/projects/r%201", label: "Open project room" });
    expect(notificationTarget(n("project_message", {}), "ada")).toEqual({ to: "/projects", label: "Open project room" });
  });
});

describe("notificationTarget: feedback", () => {
  it("opens the request, or the list when none is named", () => {
    for (const type of ["critique_note", "critique_thanks"] as const) {
      expect(notificationTarget(n(type, { critiqueId: "q 1" }), "ada")).toEqual({ to: "/critiques/q%201", label: "View feedback" });
      expect(notificationTarget(n(type, {}), "ada")).toEqual({ to: "/critiques", label: "View feedback" });
    }
  });
});
