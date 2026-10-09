import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { NotificationBell } from "./NotificationBell";
import { notificationsApi } from "../../api/notifications.api";
import { ApiError } from "../../api/client";
import type { Notification } from "../../types";

vi.mock("../../api/notifications.api", () => ({
  notificationsApi: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), acceptOffer: vi.fn() },
}));
vi.mock("../../api/friends.api", () => ({ friendsApi: { accept: vi.fn(), decline: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(notificationsApi);

const actor = { id: "u2", username: "zoe", displayName: "Zoe" } as never;
function note(over: Partial<Notification>): Notification {
  return { id: "n1", recipientId: "me", type: "comment", payload: {}, actor, isRead: false, createdAt: new Date().toISOString(), ...over };
}

async function openWith(notifications: Notification[]) {
  api.list.mockResolvedValue({ notifications });
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByLabelText("Notifications"));
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.markRead.mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "me" } as never, isLoading: false, setUser: vi.fn(), refresh: vi.fn() });
});

describe("NotificationBell: help offers", () => {
  it("shows an offer with its note and lets the owner accept it", async () => {
    api.acceptOffer.mockResolvedValue({ message: "Offer accepted" });
    await openWith([
      note({ type: "help_offer", payload: { title: "Logo for my zine", message: "I can sketch this", accepted: false } }),
    ]);

    expect(screen.getByText(/offered to help with "Logo for my zine"/)).toBeInTheDocument();
    expect(screen.getByText(/I can sketch this/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept offer" }));
    expect(api.acceptOffer).toHaveBeenCalledWith("n1");
    expect(await screen.findByText("Accepted ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept offer" })).not.toBeInTheDocument();
  });

  it("shows an already-accepted offer as accepted, with no button", async () => {
    await openWith([note({ type: "help_offer", payload: { title: "Logo", accepted: true } })]);
    expect(screen.getByText("Accepted ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept offer" })).not.toBeInTheDocument();
  });

  it("tells the offerer their offer was accepted", async () => {
    await openWith([note({ type: "help_accepted", payload: { title: "Logo for my zine" } })]);
    expect(screen.getByText(/accepted your offer to help with "Logo for my zine"/)).toBeInTheDocument();
  });

  it("alerts with the server's message if accepting fails", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    api.acceptOffer.mockRejectedValue(new ApiError(404, "Offer not found"));
    await openWith([note({ type: "help_offer", payload: { title: "Logo", accepted: false } })]);

    await userEvent.click(screen.getByRole("button", { name: "Accept offer" }));

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Offer not found"));
    expect(screen.getByRole("button", { name: "Accept offer" })).toBeInTheDocument();
    alertSpy.mockRestore();
  });
});

describe("NotificationBell: friends going live", () => {
  it("says who is live and what about, with a link straight to the room", async () => {
    await openWith([note({ type: "live_started", payload: { liveId: "live123", title: "Mixing a track" } })]);
    expect(screen.getByText(/is live now: "Mixing a track"/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zoe" })).toHaveAttribute("href", "/u/zoe");
    expect(screen.getByRole("link", { name: "Listen live" })).toHaveAttribute("href", "/live/live123");
  });

  it("marks it read and closes the list when you go to listen", async () => {
    await openWith([note({ type: "live_started", payload: { liveId: "live123", title: "Open mic" } })]);
    await userEvent.click(screen.getByRole("link", { name: "Listen live" }));
    expect(api.markRead).toHaveBeenCalledWith("n1");
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });

  it("still reads sensibly without a title, and offers no link without a room", async () => {
    await openWith([note({ type: "live_started", payload: {} })]);
    expect(screen.getByText(/is live now/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Listen live" })).not.toBeInTheDocument();
  });
});

// ---- clicking a notification takes you to what it was about ----
function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search + l.hash}</div>;
}
async function openAndRender(notifications: Notification[]) {
  api.list.mockResolvedValue({ notifications });
  render(
    <MemoryRouter initialEntries={["/somewhere"]}>
      <Routes>
        <Route path="*" element={<NotificationBell />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByLabelText("Notifications"));
}
const where = () => screen.getByTestId("where").textContent;

describe("NotificationBell: where clicking goes", () => {
  it("a comment on your post: opens that post, pointing at the comment, and closes the list", async () => {
    await openAndRender([note({ type: "comment", payload: { postId: "p1", commentId: "c1" } })]);
    await userEvent.click(screen.getByText(/commented on your post/));
    expect(where()).toBe("/posts/p1?comment=c1");
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    expect(api.markRead).toHaveBeenCalledWith("n1");
  });

  it("also offers an explicit link, which does the same once", async () => {
    await openAndRender([note({ type: "comment", payload: { postId: "p1", commentId: "c1" } })]);
    await userEvent.click(screen.getByRole("link", { name: "View post" }));
    expect(where()).toBe("/posts/p1?comment=c1");
    expect(api.markRead).toHaveBeenCalledTimes(1);
  });

  it("a message: opens the conversation with that person, and says how many", async () => {
    await openAndRender([note({ type: "message", payload: { count: 3 } })]);
    expect(screen.getByText(/sent you 3 messages/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Open conversation" }));
    expect(where()).toBe("/messages/zoe");
  });

  it("says 'a message' for one", async () => {
    await openAndRender([note({ type: "message", payload: { count: 1 } })]);
    expect(screen.getByText(/sent you a message/)).toBeInTheDocument();
  });

  it("a testimonial on your profile: opens your profile at the testimonials", async () => {
    await openAndRender([note({ type: "profile_comment", payload: { commentId: "c9" } })]);
    await userEvent.click(screen.getByText(/left a comment on your profile/));
    expect(where()).toBe("/u/me#testimonials");
  });

  it("a comment on a portfolio piece: opens that piece and comment on your profile", async () => {
    await openAndRender([note({ type: "media_comment", payload: { mediaId: "m7", commentId: "c9" } })]);
    await userEvent.click(screen.getByText(/commented on your portfolio/));
    expect(where()).toBe("/u/me?piece=m7&comment=c9#portfolio");
  });

  it("an event a friend planned: says what and when, and opens it", async () => {
    await openAndRender([note({ type: "event_created", payload: { eventId: "e5", title: "Life drawing", startsAt: "2030-05-04T19:30:00.000Z" } })]);
    expect(screen.getByText(/is planning an event: "Life drawing"/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/is planning an event/));
    expect(where()).toBe("/events/e5");
  });

  it("a changed, cancelled or soon-starting event says so", async () => {
    await openAndRender([
      note({ id: "n1", type: "event_updated", payload: { eventId: "e5", title: "Life drawing", changed: ["time", "place"] } }),
      note({ id: "n2", type: "event_cancelled", payload: { title: "Sketch along" } }),
      note({ id: "n3", type: "event_reminder", payload: { eventId: "e6", title: "Pottery" } }),
      note({ id: "n4", type: "event_reminder", payload: { eventId: "e7", title: "My show", own: true } }),
    ]);
    expect(screen.getByText(/changed an event you answered: "Life drawing" — the time and place changed/)).toBeInTheDocument();
    expect(screen.getByText(/cancelled an event: "Sketch along"/)).toBeInTheDocument();
    expect(screen.getByText(/has an event starting soon: "Pottery"/)).toBeInTheDocument();
    expect(screen.getByText(/your event "My show" starts soon/)).toBeInTheDocument();
  });

  it("a friend's birthday: says so and opens their profile", async () => {
    await openAndRender([note({ type: "friend_birthday" })]);
    expect(screen.getByText(/has a birthday today/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/has a birthday today/));
    expect(where()).toBe("/u/zoe");
  });

  it("a comment on your blog entry: says which entry and opens it at the comment", async () => {
    await openAndRender([note({ type: "blog_comment", payload: { entryId: "e4", commentId: "c2", title: "My studio" } })]);
    expect(screen.getByText(/commented on your blog entry "My studio"/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/commented on your blog entry/));
    expect(where()).toBe("/blog/e4?comment=c2");
  });

  it("someone accepting your friend request: opens their profile", async () => {
    await openAndRender([note({ type: "friend_accept" })]);
    await userEvent.click(screen.getByText(/accepted your friend request/));
    expect(where()).toBe("/u/zoe");
  });

  it("a friend request: opens the Friends page, but Accept and Decline just do their job", async () => {
    await openAndRender([note({ type: "friend_request", friendshipStatus: "pending", payload: { friendshipId: "f1" } })]);
    await userEvent.click(screen.getByText(/sent you a friend request/));
    expect(where()).toBe("/friends");
  });

  it("help offers: open the Help wanted page, but the Accept button doesn't navigate", async () => {
    api.acceptOffer.mockResolvedValue({ message: "ok" });
    await openAndRender([note({ type: "help_offer", payload: { title: "Logo", accepted: false } })]);
    await userEvent.click(screen.getByRole("button", { name: "Accept offer" }));
    expect(where()).toBe("/somewhere");
    await userEvent.click(screen.getByText(/offered to help with/));
    expect(where()).toBe("/help-wanted");
  });

  it("a friend going live: opens the live room", async () => {
    await openAndRender([note({ type: "live_started", payload: { liveId: "live9", title: "Open mic" } })]);
    await userEvent.click(screen.getByText(/is live now/));
    expect(where()).toBe("/live/live9");
  });

  it("the person's name and picture still go to their profile, not the notification's target", async () => {
    await openAndRender([note({ type: "comment", payload: { postId: "p1", commentId: "c1" } })]);
    await userEvent.click(screen.getByRole("link", { name: "Zoe" }));
    expect(where()).toBe("/u/zoe");
  });

  it("an already-read notification still takes you there, without marking it read again", async () => {
    await openAndRender([note({ type: "comment", isRead: true, payload: { postId: "p1" } })]);
    await userEvent.click(screen.getByText(/commented on your post/));
    expect(where()).toBe("/posts/p1");
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it("one with nowhere to go (a kind this version doesn't know) is only marked read", async () => {
    await openAndRender([note({ type: "something_new" as never, payload: {} })]);
    await userEvent.click(screen.getByText(/sent you a notification/));
    expect(where()).toBe("/somewhere");
    expect(api.markRead).toHaveBeenCalledWith("n1");
    expect(screen.queryByRole("link", { name: /View|Open|Listen/ })).not.toBeInTheDocument();
  });
});

describe("NotificationBell: moderation", () => {
  it("thanks someone whose report led to action, and someone whose report didn't", async () => {
    await openWith([note({ id: "a", type: "report_resolved", payload: { outcome: "action_taken" }, actor: null }), note({ id: "b", type: "report_resolved", payload: { outcome: "no_action" }, actor: null })]);
    expect(await screen.findByText(/took action. Thank you/)).toBeInTheDocument();
    expect(screen.getByText(/found nothing to act on. Thank you/)).toBeInTheDocument();
  });
  it("tells someone what kind of thing of theirs was removed, and gives no link", async () => {
    await openWith([note({ type: "content_removed", payload: { what: "blog entry" }, actor: null })]);
    expect(await screen.findByText(/removed your blog entry for breaking the site's rules/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View|Read|Open/ })).not.toBeInTheDocument();
  });
  it("copes with a removal notice missing its details", async () => {
    await openWith([note({ type: "content_removed", payload: {}, actor: null })]);
    expect(await screen.findByText(/removed your content/)).toBeInTheDocument();
  });
});

describe("NotificationBell: reactions", () => {
  it("says who reacted how to what, and opens the post or the picture", async () => {
    await openWith([note({ id: "a", type: "reaction", payload: { targetType: "post", targetId: "p9", emoji: "fire" } }), note({ id: "b", type: "reaction", payload: { targetType: "media", targetId: "m4", emoji: "love" } })]);
    expect(await screen.findByText("reacted 🔥 to your post")).toBeInTheDocument();
    expect(screen.getByText("reacted ❤️ to your portfolio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View post" })).toHaveAttribute("href", "/posts/p9");
    expect(screen.getByRole("link", { name: "View piece" })).toHaveAttribute("href", "/u/me?piece=m4#portfolio");
  });
});

describe("NotificationBell: CSverified", () => {
  it("says which way the badge was given, and opens your own profile", async () => {
    await openWith([note({ id: "a", type: "cs_verified", payload: { reason: "admin" }, actor: null }), note({ id: "b", type: "cs_verified", payload: { reason: "friends" }, actor: null })]);
    expect(await screen.findByText(/an administrator gave you the badge/)).toBeInTheDocument();
    expect(screen.getByText(/you have 1,000 active friends/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View your profile" })[0]).toHaveAttribute("href", "/u/me");
  });
});

describe("NotificationBell: invite links", () => {
  it("says someone joined through your link, and links to them", async () => {
    await openWith([note({ type: "invite_joined", payload: { inviteId: "i1" } })]);
    expect(await screen.findByText(/joined with your invite link/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toBeInTheDocument();
  });
});

describe("NotificationBell: blog entries", () => {
  it("announces a new entry with its title and links to it", async () => {
    await openWith([note({ type: "blog_post", payload: { title: "A day in the studio", entryId: "e1" } })]);
    expect(await screen.findByText(/wrote a blog entry: "A day in the studio"/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read entry" })).toHaveAttribute("href", "/blog/e1");
  });
  it("copes with a notification missing its details", async () => {
    await openWith([note({ id: "b", type: "blog_post", payload: {} })]);
    expect(await screen.findByText("wrote a blog entry")).toBeInTheDocument();
  });
});

describe("NotificationBell: planned lives", () => {
  it("announces a planned live with its title and time, and takes you to the schedule", async () => {
    await openWith([note({ type: "live_scheduled", payload: { title: "Friday jam", startsAt: "2099-10-10T19:00:00.000Z", scheduledId: "p1" } })]);
    expect(await screen.findByText(/scheduled a live: "Friday jam"/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See upcoming lives" })).toHaveAttribute("href", "/live");
  });

  it("says a planned live starts soon, for someone who asked to be reminded", async () => {
    await openWith([note({ type: "live_reminder", payload: { title: "Friday jam", scheduledId: "p1" } })]);
    expect(await screen.findByText(/has a live starting soon: "Friday jam"/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Live" })).toHaveAttribute("href", "/live");
  });

  it("tells the host their own live starts soon", async () => {
    await openWith([note({ type: "live_reminder", payload: { title: "Friday jam", scheduledId: "p1", own: true } })]);
    expect(await screen.findByText(/your live "Friday jam" starts soon/)).toBeInTheDocument();
  });

  it("copes with a notification missing its details", async () => {
    await openWith([note({ id: "a", type: "live_scheduled", payload: {} })]);
    expect(await screen.findByText("scheduled a live")).toBeInTheDocument();
  });
});

describe("NotificationBell: older notifications", () => {
  it("shows older ones from the oldest on the list, and stops when there are no more", async () => {
    api.list.mockResolvedValueOnce({ notifications: [note({ id: "n2", payload: {} })], hasMore: true });
    api.list.mockResolvedValueOnce({ notifications: [note({ id: "n1", type: "friend_accept" })], hasMore: false });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByLabelText("Notifications"));
    await userEvent.click(await screen.findByRole("button", { name: "Show older notifications" }));

    expect(api.list).toHaveBeenLastCalledWith("n2");
    expect(await screen.findByText(/accepted your friend request/)).toBeInTheDocument();
    expect(screen.getByText(/commented on your post/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show older notifications" })).not.toBeInTheDocument();
  });

  it("keeps the older ones it has loaded when the list refreshes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.list.mockResolvedValueOnce({ notifications: [note({ id: "n2" })], hasMore: true });
      api.list.mockResolvedValueOnce({ notifications: [note({ id: "n1", type: "friend_accept" })], hasMore: false });
      api.list.mockResolvedValue({ notifications: [note({ id: "n3", type: "message", payload: { count: 1 } }), note({ id: "n2" })], hasMore: true });
      render(
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      );
      await userEvent.click(screen.getByLabelText("Notifications"));
      await userEvent.click(await screen.findByRole("button", { name: "Show older notifications" }));
      await screen.findByText(/accepted your friend request/);

      await vi.advanceTimersByTimeAsync(31_000);
      expect(await screen.findByText(/sent you a message/)).toBeInTheDocument(); // the new one arrived
      expect(screen.getByText(/accepted your friend request/)).toBeInTheDocument(); // the older one stayed
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("NotificationBell: credits", () => {
  it("says who credited you and as what, and who accepted a credit on your piece", async () => {
    await openWith([note({ id: "a", type: "credit_request", payload: { role: "Producer", itemId: "m1" } }), note({ id: "b", type: "credit_accepted", payload: { itemId: "m1" } })]);
    expect(await screen.findByText("credited you on a piece: Producer")).toBeInTheDocument();
    expect(screen.getByText("accepted a credit on your piece")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View credit" })[0]).toHaveAttribute("href", "/u/me#portfolio");
  });
});

describe("NotificationBell: work requests", () => {
  it("says someone asked you for work, and whether your request was accepted or declined", async () => {
    await openWith([note({ id: "a", type: "work_request", payload: { title: "A logo" } }), note({ id: "b", type: "work_reply", payload: { accepted: true } }), note({ id: "c", type: "work_reply", payload: { accepted: false } })]);
    expect(await screen.findByText("sent you a request for work")).toBeInTheDocument();
    expect(screen.getByText("accepted your request for work")).toBeInTheDocument();
    expect(screen.getByText("declined your request for work")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View requests" })).toHaveAttribute("href", "/u/me#work");
  });
});

describe("NotificationBell: mentions", () => {
  it("says someone mentioned you and links to where", async () => {
    await openWith([note({ id: "m", type: "mention", payload: { url: "/posts/p9" } })]);
    expect(await screen.findByText("mentioned you")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See where" })).toHaveAttribute("href", "/posts/p9");
  });
});

describe("NotificationBell: follows", () => {
  it("says someone started following you", async () => {
    await openWith([note({ id: "f", type: "follow", payload: {} })]);
    expect(await screen.findByText("started following you")).toBeInTheDocument();
  });
});

describe("NotificationBell: shares", () => {
  it("says someone shared your post and links to it", async () => {
    await openWith([note({ id: "r", type: "repost", payload: { postId: "p9" } })]);
    expect(await screen.findByText("shared your post")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View post" })).toHaveAttribute("href", "/posts/p9");
  });
});

describe("NotificationBell: replies", () => {
  it("says someone replied to your comment and links to the reply", async () => {
    await openWith([note({ id: "rp", type: "reply", payload: { url: "/blog/b1?comment=c3" } })]);
    expect(await screen.findByText("replied to your comment")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View reply" })).toHaveAttribute("href", "/blog/b1?comment=c3");
  });
});

describe("NotificationBell: open calls", () => {
  it("says a call fits what you offer, that someone answered yours, and how yours was answered, each linking to the call", async () => {
    await openWith([
      note({ id: "m", type: "call_match", payload: { callId: "c1", title: "A vocalist" } }),
      note({ id: "a", type: "call_application", payload: { callId: "c2", title: "A drummer" } }),
      note({ id: "y", type: "call_answer", payload: { callId: "c3", title: "A mixer", chosen: true } }),
      note({ id: "n", type: "call_answer", payload: { callId: "c4", title: "A cover", chosen: false } }),
    ]);
    expect(await screen.findByText("posted an open call that fits what you offer: A vocalist")).toBeInTheDocument();
    expect(screen.getByText("answered your open call: A drummer")).toBeInTheDocument();
    expect(screen.getByText("chose you for the open call: A mixer")).toBeInTheDocument();
    expect(screen.getByText("answered your reply to the open call: A cover")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View call" }).map((l) => l.getAttribute("href"))).toEqual(["/calls/c1", "/calls/c2", "/calls/c3", "/calls/c4"]);
  });
});

describe("NotificationBell: project rooms", () => {
  it("says someone wrote in your room, counting what is new, and links to the room", async () => {
    await openWith([note({ id: "p1", type: "project_message", payload: { projectId: "r1", title: "EP sessions", count: 1 } }), note({ id: "p2", type: "project_message", payload: { projectId: "r2", title: "Cover art", count: 4 } })]);
    expect(await screen.findByText("wrote in your project room: EP sessions")).toBeInTheDocument();
    expect(screen.getByText("wrote 4 messages in your project room: Cover art")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open project room" }).map((l) => l.getAttribute("href"))).toEqual(["/projects/r1", "/projects/r2"]);
  });
});

describe("NotificationBell: feedback on pieces", () => {
  it("says someone gave feedback, and that they were thanked, each linking to the request", async () => {
    await openWith([
      note({ id: "c1", type: "critique_note", payload: { critiqueId: "q1", title: "A vase" } }),
      note({ id: "c2", type: "critique_note", payload: { critiqueId: "q2", title: "" } }),
      note({ id: "c3", type: "critique_thanks", payload: { critiqueId: "q3" } }),
    ]);
    expect(await screen.findByText("gave you feedback on your piece: A vase")).toBeInTheDocument();
    expect(screen.getByText("gave you feedback on one of your pieces")).toBeInTheDocument();
    expect(screen.getByText("thanked you for your feedback")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View feedback" }).map((l) => l.getAttribute("href"))).toEqual(["/critiques/q1", "/critiques/q2", "/critiques/q3"]);
  });
});
