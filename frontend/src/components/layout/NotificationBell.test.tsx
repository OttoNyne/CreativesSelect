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
