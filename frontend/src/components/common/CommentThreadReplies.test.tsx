import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentThread } from "./CommentThread";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name }) as User;
const comment = (id: string, authorId: string, name: string, content: string, parent: string | null = null): Comment => ({ id, content, parent, createdAt: "", author: person(authorId, name) }) as Comment;

const THREAD = [comment("c1", "u-zoe", "Zoe", "Top one"), comment("c2", "u-kai", "Kai", "Reply to one", "c1"), comment("c3", "u-liv", "Liv", "Top two"), comment("c4", "u-ann", "Ann", "Second reply to one", "c1")];

function setup(over: Partial<React.ComponentProps<typeof CommentThread>> = {}, signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? person("me", "Me") : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  const props = {
    threadKey: "t1",
    load: vi.fn().mockResolvedValue({ comments: THREAD, hasMore: false }),
    add: vi.fn(),
    update: vi.fn(),
    onCountChange: vi.fn(),
    ...over,
  };
  render(<CommentThread {...props} />);
  return props;
}

beforeEach(() => {
  window.confirm = vi.fn(() => true);
});

describe("CommentThread: replies", () => {
  it("shows each reply under the comment it answers, indented, and the other comments between them in order", async () => {
    setup();
    await screen.findByText("Top one");
    const order = [...document.querySelectorAll("[id^='comment-']")].map((el) => el.id);
    expect(order).toEqual(["comment-c1", "comment-c2", "comment-c4", "comment-c3"]);
    expect(document.getElementById("comment-c2")).toHaveClass("ms-8");
    expect(document.getElementById("comment-c1")).not.toHaveClass("ms-8");
  });

  it("answers a comment: names the person, says who is being answered, and sends the reply with its comment", async () => {
    const add = vi.fn().mockResolvedValue({ comment: comment("c9", "me", "Me", "@zoe Thanks", "c1") });
    const props = setup({ add });
    await screen.findByText("Top one");
    await userEvent.click(screen.getByRole("button", { name: "Reply to Zoe" }));
    expect(screen.getByText("Replying to Zoe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write a reply…")).toHaveValue("@zoe ");
    await userEvent.type(screen.getByPlaceholderText("Write a reply…"), "Thanks");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(add).toHaveBeenCalledWith("@zoe Thanks", undefined, "c1");
    expect(within(document.getElementById("comment-c9")!.parentElement!).getByText("Top one")).toBeInTheDocument(); // it is placed under its comment
    expect(document.getElementById("comment-c9")).toHaveClass("ms-8");
    expect((props.onCountChange as ReturnType<typeof vi.fn>).mock.calls[0][0](3)).toBe(4);
    expect(screen.queryByText(/Replying to/)).toBeNull(); // and the box goes back to an ordinary comment
    expect(screen.getByPlaceholderText("Write a comment…")).toHaveValue("");
  });

  it("answering a reply goes under the same top-level comment", async () => {
    const add = vi.fn().mockResolvedValue({ comment: comment("c9", "me", "Me", "@kai yes", "c1") });
    setup({ add });
    await screen.findByText("Reply to one");
    await userEvent.click(screen.getByRole("button", { name: "Reply to Kai" }));
    expect(screen.getByText("Replying to Kai")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Write a reply…"), "yes");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(add).toHaveBeenCalledWith("@kai yes", undefined, "c1");
  });

  it("can be cancelled, going back to an ordinary comment", async () => {
    const add = vi.fn().mockResolvedValue({ comment: comment("c9", "me", "Me", "plain") });
    setup({ add });
    await screen.findByText("Top two");
    await userEvent.click(screen.getByRole("button", { name: "Reply to Liv" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Replying to/)).toBeNull();
    expect(screen.getByPlaceholderText("Write a comment…")).toHaveValue("");
    await userEvent.type(screen.getByPlaceholderText("Write a comment…"), "plain");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(add).toHaveBeenCalledWith("plain", undefined);
  });

  it("doesn't name you when you answer your own comment", async () => {
    setup({ load: vi.fn().mockResolvedValue({ comments: [comment("c1", "me", "Me", "Mine")], hasMore: false }) });
    await screen.findByText("Mine");
    await userEvent.click(screen.getByRole("button", { name: "Reply to Me" }));
    expect(screen.getByPlaceholderText("Write a reply…")).toHaveValue("");
  });

  it("offers no Reply to someone who isn't signed in", async () => {
    setup({}, false);
    await screen.findByText("Top one");
    expect(screen.queryByRole("button", { name: /^Reply to/ })).toBeNull();
  });

  it("takes the replies away with the comment, and counts all of them", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const props = setup({ remove, canModerate: true });
    await userEvent.click(await screen.findByRole("button", { name: "Delete comment by Zoe" }));
    expect(remove).toHaveBeenCalledWith("c1");
    expect(screen.queryByText("Top one")).toBeNull();
    expect(screen.queryByText("Reply to one")).toBeNull();
    expect(screen.queryByText("Second reply to one")).toBeNull();
    expect(screen.getByText("Top two")).toBeInTheDocument();
    expect((props.onCountChange as ReturnType<typeof vi.fn>).mock.calls[0][0](10)).toBe(7); // the comment and its two replies
  });

  it("shows a reply whose comment is gone as a comment of its own", async () => {
    setup({ load: vi.fn().mockResolvedValue({ comments: [comment("c2", "u-kai", "Kai", "Orphan reply", "gone")], hasMore: false }) });
    await screen.findByText("Orphan reply");
    expect(document.getElementById("comment-c2")).not.toHaveClass("ms-8");
  });

  it("highlights and scrolls to a reply a notification was about", async () => {
    const scroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    setup({ highlightId: "c4" });
    await screen.findByText("Second reply to one");
    expect(document.getElementById("comment-c4")).toHaveAttribute("aria-current", "true");
    expect(scroll).toHaveBeenCalled();
  });
});
