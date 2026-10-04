import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { GroupBoard } from "./GroupBoard";
import { groupsApi } from "../../api/groups.api";
import { moderationApi } from "../../api/moderation.api";
import { ApiError } from "../../api/client";
import type { GroupReply, GroupTopic, User } from "../../types";

vi.mock("../../api/groups.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/groups.api")>()),
  groupsApi: { topics: vi.fn(), createTopic: vi.fn(), updateTopic: vi.fn(), updateReply: vi.fn(), topic: vi.fn(), deleteTopic: vi.fn(), reply: vi.fn(), deleteReply: vi.fn(), pinTopic: vi.fn() },
}));
vi.mock("../../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
const api = vi.mocked(groupsApi);

const ada = { id: "u1", username: "ada", displayName: "Ada", avatarUrl: null } as User;
const zoe = { id: "u2", username: "zoe", displayName: "Zoe", avatarUrl: null } as User;
const topic = (over: Partial<GroupTopic> = {}): GroupTopic => ({
  id: "t1",
  groupId: "g1",
  title: "Kiln recommendations",
  body: "Which one do you use?\n\nBudget <b>is</b> tight.",
  pinned: false,
  replyCount: 0,
  createdAt: "2026-10-04T12:00:00.000Z",
  lastActivityAt: "2026-10-04T12:00:00.000Z",
  mine: false,
  author: ada,
  ...over,
});
const reply = (over: Partial<GroupReply> = {}): GroupReply => ({ id: "r1", topicId: "t1", body: "I use a small electric one", createdAt: "2026-10-05T12:00:00.000Z", mine: false, author: zoe, ...over });

function renderBoard(canModerate = false) {
  return render(
    <MemoryRouter>
      <GroupBoard groupId="g1" canModerate={canModerate} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.restoreAllMocks();
  api.topics.mockResolvedValue({ topics: [topic({ id: "t0", title: "Welcome", pinned: true, replyCount: 1 }), topic()], page: 1, hasMore: false });
  api.topic.mockResolvedValue({ topic: topic({ replyCount: 1 }), replies: [reply()], page: 1, hasMore: false });
});

describe("GroupBoard: the list of topics", () => {
  it("lists topics with who started them, how many replies they have and when they were active, pinned ones marked", async () => {
    renderBoard();
    const welcome = await screen.findByRole("button", { name: /Welcome/ });
    expect(welcome).toHaveTextContent("Pinned");
    expect(welcome).toHaveTextContent("1 reply");
    const kiln = screen.getByRole("button", { name: /Kiln recommendations/ });
    expect(kiln).toHaveTextContent("Ada");
    expect(kiln).toHaveTextContent("0 replies");
    expect(kiln).toHaveTextContent("October 4, 2026");
    expect(api.topics).toHaveBeenCalledWith("g1");
  });

  it("says when there are no topics, and when the board can't be loaded", async () => {
    api.topics.mockResolvedValueOnce({ topics: [], page: 1, hasMore: false });
    const { unmount } = renderBoard();
    expect(await screen.findByText(/No topics yet/)).toBeInTheDocument();
    unmount();
    api.topics.mockRejectedValue(new ApiError(403, "Join this group to use its board"));
    renderBoard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Join this group to use its board");
  });

  it("shows more topics, without repeating any", async () => {
    api.topics.mockResolvedValueOnce({ topics: [topic()], page: 1, hasMore: true });
    api.topics.mockResolvedValueOnce({ topics: [topic(), topic({ id: "t2", title: "Glazes" })], page: 2, hasMore: false });
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: "Show more topics" }));
    expect(api.topics).toHaveBeenLastCalledWith("g1", 2);
    expect(await screen.findByRole("button", { name: /Glazes/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Kiln recommendations/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more topics" })).not.toBeInTheDocument();
  });
});

describe("GroupBoard: starting a topic", () => {
  it("starts one, opens it, and clears the form", async () => {
    api.topics.mockResolvedValue({ topics: [], page: 1, hasMore: false });
    api.createTopic.mockResolvedValue({ topic: topic({ id: "t9", title: "Fresh", mine: true }) });
    api.topic.mockResolvedValue({ topic: topic({ id: "t9", title: "Fresh", mine: true }), replies: [], page: 1, hasMore: false });
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: "New topic" }));
    await userEvent.type(screen.getByLabelText("Topic title"), "Fresh");
    await userEvent.type(screen.getByLabelText("Topic text"), "Hello");
    expect(screen.getByText("5 / 2000")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start topic" }));
    expect(api.createTopic).toHaveBeenCalledWith("g1", { title: "Fresh", body: "Hello" });
    expect(await screen.findByRole("heading", { name: "Fresh" })).toBeInTheDocument();
  });

  it("asks for a title and some text before sending, and shows the server's reason if it fails", async () => {
    api.topics.mockResolvedValue({ topics: [], page: 1, hasMore: false });
    api.createTopic.mockRejectedValue(new ApiError(429, "You've started a lot of topics — try again later."));
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: "New topic" }));
    await userEvent.click(screen.getByRole("button", { name: "Start topic" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give your topic a title");
    await userEvent.type(screen.getByLabelText("Topic title"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Start topic" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write something to start the topic");
    await userEvent.type(screen.getByLabelText("Topic text"), "There");
    await userEvent.click(screen.getByRole("button", { name: "Start topic" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try again later");
    expect(screen.getByLabelText("Topic text")).toHaveValue("There");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Topic title")).not.toBeInTheDocument();
  });
});

describe("GroupBoard: a topic", () => {
  async function openKiln(canModerate = false) {
    renderBoard(canModerate);
    await userEvent.click(await screen.findByRole("button", { name: /Kiln recommendations/ }));
    return screen.findByRole("heading", { name: "Kiln recommendations" });
  }

  it("shows the topic and its replies as plain text, and goes back to the list", async () => {
    await openKiln();
    expect(api.topic).toHaveBeenCalledWith("g1", "t1");
    expect(screen.getByText(/Budget <b>is<\/b> tight\./)).toBeInTheDocument();
    expect(document.querySelector("section[aria-label='Topic'] b")).toBeNull();
    expect(screen.getByText("I use a small electric one")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByText("1 reply")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "← Back to the board" }));
    expect(await screen.findByRole("button", { name: /Welcome/ })).toBeInTheDocument();
    expect(api.topics).toHaveBeenCalledTimes(2); // reloaded: counts and order may have changed
  });

  it("posts a reply, adding it and counting it", async () => {
    api.reply.mockResolvedValue({ reply: reply({ id: "r2", body: "Mine too", mine: true, author: ada }) });
    await openKiln();
    await userEvent.type(screen.getByLabelText("Reply"), "Mine too");
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(api.reply).toHaveBeenCalledWith("g1", "t1", "Mine too");
    expect(await screen.findByText("Mine too")).toBeInTheDocument();
    expect(screen.getByText("2 replies")).toBeInTheDocument();
    expect(screen.getByLabelText("Reply")).toHaveValue("");
  });

  it("can't send an empty reply, and shows the server's reason when one fails", async () => {
    api.reply.mockRejectedValue(new ApiError(429, "You're replying too fast — try again in a few minutes."));
    await openKiln();
    expect(screen.getByRole("button", { name: "Reply" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Reply"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("replying too fast");
    expect(screen.getByLabelText("Reply")).toHaveValue("Hi");
  });

  it("shows more replies, without repeating any", async () => {
    api.topic.mockResolvedValueOnce({ topic: topic({ replyCount: 2 }), replies: [reply()], page: 1, hasMore: true });
    api.topic.mockResolvedValueOnce({ topic: topic({ replyCount: 2 }), replies: [reply(), reply({ id: "r2", body: "Second page" })], page: 2, hasMore: false });
    await openKiln();
    await userEvent.click(screen.getByRole("button", { name: "Show more replies" }));
    expect(api.topic).toHaveBeenLastCalledWith("g1", "t1", 2);
    expect(await screen.findByText("Second page")).toBeInTheDocument();
    expect(screen.getAllByText("I use a small electric one")).toHaveLength(1);
  });

  it("lets a member delete only their own reply, after asking", async () => {
    api.topic.mockResolvedValue({ topic: topic({ replyCount: 2 }), replies: [reply(), reply({ id: "r2", body: "Mine", mine: true, author: ada })], page: 1, hasMore: false });
    api.deleteReply.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await openKiln();
    expect(screen.getAllByRole("button", { name: /Delete reply/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Delete reply by you" }));
    expect(api.deleteReply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete reply by you" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(api.deleteReply).toHaveBeenCalledWith("g1", "t1", "r2"));
    await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
    expect(screen.getByText("1 reply")).toBeInTheDocument();
  });

  it("lets an admin delete anyone's reply and the topic, and pin or unpin it", async () => {
    api.pinTopic.mockResolvedValueOnce({ topic: topic({ pinned: true }) });
    api.pinTopic.mockResolvedValueOnce({ topic: topic({ pinned: false }) });
    api.deleteTopic.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openKiln(true);
    expect(screen.getByRole("button", { name: "Delete reply by Zoe" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pin topic" }));
    expect(api.pinTopic).toHaveBeenLastCalledWith("g1", "t1", true);
    await userEvent.click(await screen.findByRole("button", { name: "Unpin topic" }));
    expect(api.pinTopic).toHaveBeenLastCalledWith("g1", "t1", false);
    await userEvent.click(screen.getByRole("button", { name: "Delete topic" }));
    expect(api.deleteTopic).toHaveBeenCalledWith("g1", "t1");
    expect(await screen.findByRole("button", { name: "New topic" })).toBeInTheDocument(); // back on the board
  });

  it("lets a member report someone else's topic or reply, with a reason, and not their own", async () => {
    vi.mocked(moderationApi.report).mockReset();
    vi.mocked(moderationApi.report).mockResolvedValue({ report: {} });
    vi.spyOn(window, "prompt").mockReturnValueOnce("spam").mockReturnValueOnce("rude").mockReturnValueOnce("");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    api.topic.mockResolvedValue({ topic: topic({ replyCount: 2 }), replies: [reply(), reply({ id: "r2", body: "Mine", mine: true, author: ada })], page: 1, hasMore: false });
    await openKiln();
    expect(screen.getAllByRole("button", { name: /^Report reply/ })).toHaveLength(1); // not on their own
    await userEvent.click(screen.getByRole("button", { name: "Report topic" }));
    expect(moderationApi.report).toHaveBeenLastCalledWith("groupTopic", "t1", "spam");
    await userEvent.click(screen.getByRole("button", { name: "Report reply by Zoe" }));
    expect(moderationApi.report).toHaveBeenLastCalledWith("groupReply", "r1", "rude");
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("Report submitted"));
    await userEvent.click(screen.getByRole("button", { name: "Report topic" })); // no reason given: nothing sent
    expect(moderationApi.report).toHaveBeenCalledTimes(2);
  });

  it("doesn't offer to report your own topic, and says so when a report can't be sent", async () => {
    api.topic.mockResolvedValue({ topic: topic({ mine: true }), replies: [], page: 1, hasMore: false });
    await openKiln();
    expect(screen.queryByRole("button", { name: "Report topic" })).not.toBeInTheDocument();
  });

  it("shows why a report couldn't be sent", async () => {
    vi.mocked(moderationApi.report).mockReset();
    vi.mocked(moderationApi.report).mockRejectedValue(new ApiError(500, "boom"));
    vi.spyOn(window, "prompt").mockReturnValue("spam");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    await openKiln();
    await userEvent.click(screen.getByRole("button", { name: "Report topic" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("boom"));
  });

  it("offers an ordinary member no pin button, no delete on others' topics and no delete on others' replies", async () => {
    await openKiln(false);
    expect(screen.queryByRole("button", { name: "Pin topic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete topic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete reply/ })).not.toBeInTheDocument();
  });

  it("lets the author delete their own topic", async () => {
    api.topic.mockResolvedValue({ topic: topic({ mine: true }), replies: [], page: 1, hasMore: false });
    await openKiln(false);
    expect(screen.getByRole("button", { name: "Delete topic" })).toBeInTheDocument();
  });

  it("says so when a pin can't be changed, or a topic can't be deleted", async () => {
    api.pinTopic.mockRejectedValue(new ApiError(400, "You can pin up to 3 topics — unpin one first"));
    api.deleteTopic.mockRejectedValue(new ApiError(500, "boom"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openKiln(true);
    await userEvent.click(screen.getByRole("button", { name: "Pin topic" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pin up to 3");
    await userEvent.click(screen.getByRole("button", { name: "Delete topic" }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("says when the topic is gone, or can't be loaded", async () => {
    api.topic.mockRejectedValueOnce(new ApiError(404, "Topic not found"));
    const { unmount } = renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /Kiln recommendations/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This topic isn't available");
    unmount();
    api.topic.mockRejectedValueOnce(new ApiError(500, "boom"));
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /Kiln recommendations/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this topic");
  });
});

describe("GroupBoard: editing", () => {
  it("lets the starter change their topic's title and text", async () => {
    api.topic.mockResolvedValue({ topic: topic({ mine: true }), replies: [], page: 1, hasMore: false });
    api.updateTopic.mockResolvedValue({ topic: topic({ mine: true, title: "Kilns, revisited", body: "New text", editedAt: "2026-10-05T00:00:00.000Z" }) });
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /Kiln recommendations/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit topic" }));
    const title = screen.getByLabelText("Edit topic: title");
    await userEvent.clear(title);
    await userEvent.type(title, "Kilns, revisited");
    const text = screen.getByLabelText("Edit topic");
    await userEvent.clear(text);
    await userEvent.type(text, "New text");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.updateTopic).toHaveBeenCalledWith("g1", "t1", { title: "Kilns, revisited", body: "New text" });
    expect(await screen.findByRole("heading", { name: /Kilns, revisited/ })).toBeInTheDocument();
    expect(screen.getByText("New text")).toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });

  it("lets people change their own reply and not other people's, and not someone else's topic", async () => {
    api.topic.mockResolvedValue({ topic: topic(), replies: [reply(), reply({ id: "r2", body: "Mine", mine: true, author: ada })], page: 1, hasMore: false });
    api.updateReply.mockResolvedValue({ reply: reply({ id: "r2", body: "Mine, better", mine: true, author: ada, editedAt: "2026-10-05T00:00:00.000Z" }) });
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /Kiln recommendations/ }));
    await screen.findByText("Mine");
    expect(screen.queryByRole("button", { name: "Edit topic" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit your reply" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Edit your reply" }));
    const box = screen.getByLabelText("Edit reply");
    await userEvent.clear(box);
    await userEvent.type(box, "Mine, better");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.updateReply).toHaveBeenCalledWith("g1", "t1", "r2", "Mine, better");
    expect(await screen.findByText(/Mine, better/)).toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });
});
