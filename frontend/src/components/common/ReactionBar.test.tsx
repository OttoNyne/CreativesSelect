import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactionBar } from "./ReactionBar";
import type { ReactionKey, ReactionSummary } from "../../types";

const summary = (counts: Partial<Record<ReactionKey, number>> = {}, mine: ReactionKey | null = null): ReactionSummary => {
  const full = { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0, ...counts };
  return { counts: full, total: Object.values(full).reduce((a, n) => a + n, 0), mine };
};

describe("ReactionBar", () => {
  it("shows only the emoji that have been used, in the usual order, with their counts", () => {
    render(<ReactionBar summary={summary({ fire: 1, like: 12, wow: 3 })} canReact onReact={vi.fn()} />);
    const chips = screen.getAllByRole("button").filter((b) => /: \d+/.test(b.getAttribute("aria-label") ?? ""));
    expect(chips.map((b) => b.getAttribute("aria-label"))).toEqual(["Like: 12", "Wow: 3", "Fire: 1"]);
    expect(chips.map((b) => b.textContent)).toEqual(["👍 12", "😮 3", "🔥 1"]);
  });

  it("marks the viewer's own, and describes it for a screen reader", () => {
    render(<ReactionBar summary={summary({ love: 2 }, "love")} canReact onReact={vi.fn()} />);
    const love = screen.getByRole("button", { name: "Love: 2, your reaction" });
    expect(love).toHaveAttribute("aria-pressed", "true");
    expect(love).toHaveAttribute("title", "Take your Love away");
  });

  it("shows nothing at all when there are no reactions and the viewer can't add one", () => {
    const { container } = render(<ReactionBar summary={summary()} canReact={false} onReact={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the six to pick from when asked, and closes them after a choice", async () => {
    const onReact = vi.fn().mockResolvedValue(undefined);
    render(<ReactionBar summary={summary()} canReact onReact={onReact} />);
    const add = screen.getByRole("button", { name: "Add a reaction" });
    expect(add).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Pick a reaction" })).not.toBeInTheDocument();
    await userEvent.click(add);
    expect(add).toHaveAttribute("aria-expanded", "true");
    const picker = screen.getByRole("group", { name: "Pick a reaction" });
    expect(within(picker).getAllByRole("button").map((b) => b.textContent)).toEqual(["👍", "❤️", "😂", "😮", "😢", "🔥"]);
    await userEvent.click(within(picker).getByRole("button", { name: "Haha" }));
    expect(onReact).toHaveBeenCalledWith("laugh");
    expect(screen.queryByRole("group", { name: "Pick a reaction" })).not.toBeInTheDocument();
  });

  it("closes the six again if the person changes their mind", async () => {
    render(<ReactionBar summary={summary()} canReact onReact={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    await userEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    expect(screen.queryByRole("group", { name: "Pick a reaction" })).not.toBeInTheDocument();
  });

  it("takes the reaction away when the one you have is chosen again, from either place", async () => {
    const onReact = vi.fn().mockResolvedValue(undefined);
    render(<ReactionBar summary={summary({ sad: 1 }, "sad")} canReact onReact={onReact} />);
    await userEvent.click(screen.getByRole("button", { name: "Sad: 1, your reaction" }));
    expect(onReact).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    const own = within(screen.getByRole("group", { name: "Pick a reaction" })).getByRole("button", { name: "Sad" });
    expect(own).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(own);
    expect(onReact).toHaveBeenLastCalledWith(null);
    expect(onReact).toHaveBeenCalledTimes(2);
  });

  it("won't take a second press while the first is still being saved", async () => {
    let finish: () => void = () => {};
    const onReact = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<ReactionBar summary={summary({ like: 1 })} canReact onReact={onReact} />);
    await userEvent.click(screen.getByRole("button", { name: "Like: 1" }));
    expect(screen.getByRole("button", { name: "Like: 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add a reaction" })).toBeDisabled();
    expect(onReact).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Like: 1" })).toBeEnabled());
  });

  it("lets someone who can't react see the counts, with a reason on hover, and nothing to open", () => {
    render(<ReactionBar summary={summary({ like: 2 })} canReact={false} onReact={vi.fn()} />);
    const like = screen.getByRole("button", { name: "Like: 2" });
    expect(like).toBeDisabled();
    expect(like).toHaveAttribute("title", "Log in to react");
    expect(screen.queryByRole("button", { name: "Add a reaction" })).not.toBeInTheDocument();
  });

  it("names the group, so a page with many can tell them apart", () => {
    render(<ReactionBar summary={summary()} canReact onReact={vi.fn()} label="Reactions to this post" />);
    expect(screen.getByRole("group", { name: "Reactions to this post" })).toBeInTheDocument();
  });
});
