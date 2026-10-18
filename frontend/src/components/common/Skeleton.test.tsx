import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { CardListSkeleton, FeedSkeleton, LoadingBlock, PostSkeleton, ProfileSkeleton, Skeleton, SkeletonLines } from "./Skeleton";

const shapes = (container: HTMLElement) => container.querySelectorAll(".cs-skeleton");

describe("the loading shapes", () => {
  it("tell a screen reader what is loading, once, and hide every shape from it", () => {
    const { container } = render(
      <LoadingBlock label="Loading feed…">
        <FeedSkeleton count={2} />
      </LoadingBlock>
    );
    const status = screen.getByText("Loading feed…").closest("[role=progressbar]")!;
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    // everything drawn inside is for the eyes only
    for (const node of shapes(container)) expect(node.closest("[aria-hidden=true]"), "a shape a screen reader could land on").not.toBeNull();
  });

  it("draw the shapes of what is coming: a post has a picture, lines and buttons; a feed repeats it; a list repeats a card", () => {
    const { container: post } = render(<PostSkeleton />);
    expect(shapes(post).length).toBeGreaterThanOrEqual(6);
    const { container: feed } = render(<FeedSkeleton count={4} />);
    expect(shapes(feed).length).toBe(shapes(post).length * 4);
    const { container: list } = render(<CardListSkeleton count={3} />);
    expect(list.querySelectorAll(".rounded-xl").length).toBe(3);
    const { container: profile } = render(<ProfileSkeleton />);
    expect(shapes(profile).length).toBeGreaterThan(8);
    const { container: lines } = render(<SkeletonLines lines={5} />);
    expect(shapes(lines).length).toBe(5);
    const { container: one } = render(<Skeleton className="h-4 w-10" />);
    expect(one.firstElementChild).toHaveClass("cs-skeleton", "h-4", "w-10");
  });

  it("stop moving for people who ask their device for less motion", () => {
    const css = readFileSync("src/index.css", "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.cs-fade-in,\s*\.cs-skeleton\s*\{\s*animation:\s*none\s*!important/);
    // and the movement itself is short and gentle
    expect(css).toMatch(/\.cs-fade-in\s*\{\s*animation:\s*cs-fade-in 0\.2\d?s/);
    expect(css).toMatch(/\.cs-skeleton\s*\{[^}]*animation:\s*cs-shimmer/);
  });
});
