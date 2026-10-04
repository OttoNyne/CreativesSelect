import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityBadge } from "./ActivityBadge";
import type { Activity } from "../../types";

describe("ActivityBadge", () => {
  it.each([
    ["online", "Online now"],
    ["today", "Active today"],
    ["week", "Active this week"],
  ] as const)("says %s in words", (activity, text) => {
    render(<ActivityBadge activity={activity} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("marks only 'online' with a green dot, so the words, not the colour, carry the meaning", () => {
    const { container, rerender } = render(<ActivityBadge activity="online" />);
    expect(container.querySelector("[aria-hidden='true']")).toHaveClass("bg-emerald-400");
    rerender(<ActivityBadge activity="today" />);
    expect(container.querySelector("[aria-hidden='true']")).not.toHaveClass("bg-emerald-400");
  });

  it("renders nothing when there is nothing to show, or for something it doesn't know", () => {
    const { container, rerender } = render(<ActivityBadge />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ActivityBadge activity={"yesterday" as unknown as Activity} />);
    expect(container).toBeEmptyDOMElement();
  });
});
