import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentThread } from "./CommentThread";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name }) as User;
const comment = (id: string, authorId: string, name: string, content: string): Comment => ({ id, content, createdAt: "", author: person(authorId, name) }) as Comment;

function setup(over: Partial<React.ComponentProps<typeof CommentThread>> = {}, signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? person("me", "Me") : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  const props = {
    threadKey: "t1",
    load: vi.fn().mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Lovely"), comment("c2", "me", "Me", "Thanks")], hasMore: false }),
    add: vi.fn(),
    update: vi.fn(),
    onCountChange: vi.fn(),
    ...over,
  };
  const view = render(<CommentThread {...props} />);
  return { props, view };
}

beforeEach(() => {
  window.confirm = vi.fn(() => true);
});

describe("CommentThread", () => {
  it("says so when there are no comments yet", async () => {
    setup({ load: vi.fn().mockResolvedValue({ comments: [] }) });
    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });

  it("loads the comments again for a different thread, but not just because its parent drew again", async () => {
    const { props, view } = setup();
    await screen.findByText("Lovely");
    view.rerender(<CommentThread {...props} load={vi.fn().mockResolvedValue({ comments: [] })} />); // same thread, new function
    expect(props.load).toHaveBeenCalledTimes(1);
    const other = vi.fn().mockResolvedValue({ comments: [comment("c9", "u-kai", "Kai", "Another thread")] });
    view.rerender(<CommentThread {...props} threadKey="t2" load={other} />);
    expect(await screen.findByText("Another thread")).toBeInTheDocument();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("offers Delete only on your own comments when you don't moderate", async () => {
    setup({ remove: vi.fn() });
    await screen.findByText("Lovely");
    expect(screen.getAllByRole("button", { name: /^Delete comment/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Delete comment by you" })).toBeInTheDocument();
  });

  it("lets the owner of the page delete anyone's comment, and counts it", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { props } = setup({ remove, canModerate: true });
    await userEvent.click(await screen.findByRole("button", { name: "Delete comment by Zoe" }));
    expect(remove).toHaveBeenCalledWith("c1");
    expect(screen.queryByText("Lovely")).not.toBeInTheDocument();
    expect(vi.mocked(props.onCountChange).mock.calls[0][0](5)).toBe(4);
  });

  it("keeps the comment if you decline the confirmation or the delete fails", async () => {
    window.confirm = vi.fn(() => false);
    const remove = vi.fn().mockRejectedValue(new Error("x"));
    setup({ remove, canModerate: true });
    await userEvent.click(await screen.findByRole("button", { name: "Delete comment by Zoe" }));
    expect(remove).not.toHaveBeenCalled();
    window.confirm = vi.fn(() => true);
    await userEvent.click(screen.getByRole("button", { name: "Delete comment by Zoe" }));
    expect(await screen.findByText("Couldn't delete that comment.")).toBeInTheDocument();
    expect(screen.getByText("Lovely")).toBeInTheDocument();
  });

  it("offers Delete to nobody without a remove function", async () => {
    setup({ canModerate: true });
    await screen.findByText("Lovely");
    expect(screen.queryByRole("button", { name: /^Delete comment/ })).not.toBeInTheDocument();
  });

  it("offers Report on other people's comments to people signed in, and hands over the comment", async () => {
    const onReport = vi.fn();
    setup({ onReport });
    await userEvent.click(await screen.findByRole("button", { name: "Report comment by Zoe" }));
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(screen.getAllByRole("button", { name: /^Report comment/ })).toHaveLength(1); // not on your own
  });

  it("offers nothing to write or report to signed-out visitors", async () => {
    setup({ onReport: vi.fn() }, false);
    await screen.findByText("Lovely");
    expect(screen.queryByPlaceholderText("Write a comment…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Report comment/ })).not.toBeInTheDocument();
  });
});
