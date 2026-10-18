import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SparkDice } from "./SparkDice";
import { decodeSpark, sparkOfDay, sparkText } from "../../lib/sparks";

afterEach(() => vi.useRealTimers());

const show = (onUse?: (spark: unknown) => void) =>
  render(
    <MemoryRouter>
      <SparkDice onUse={onUse} />
    </MemoryRouter>
  );

describe("SparkDice", () => {
  it("shows today's spark, the same one for everyone, and links to the sketchpad with it", () => {
    show();
    const today = sparkOfDay();
    expect(screen.getByText(sparkText(today))).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Sketch this" });
    expect(decodeSpark(new URL(link.getAttribute("href")!, "https://x.test").searchParams.get("spark"))).toEqual(today);
  });

  it("rolls three dice of your own, and rolls just one again when it is tapped", async () => {
    const user = userEvent.setup();
    show();
    expect(screen.queryByText("Your roll")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Roll the dice" }));
    expect(screen.getByText("Your roll")).toBeInTheDocument();
    const dice = screen.getAllByRole("button", { name: /^Roll again:/ });
    expect(dice).toHaveLength(3);
    const before = dice.map((d) => d.textContent);
    await user.click(screen.getByRole("button", { name: /^Roll again: Twist/ }));
    const after = screen.getAllByRole("button", { name: /^Roll again:/ }).map((d) => d.textContent);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it("hands the spark to the page when it sits inside the sketchpad, instead of linking", async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    show(onUse);
    expect(screen.queryByRole("link", { name: "Sketch this" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Use today's spark" }));
    expect(onUse).toHaveBeenCalledWith(sparkOfDay());
    await user.click(screen.getByRole("button", { name: "Roll the dice" }));
    const region = screen.getByRole("region", { name: "Need a spark?" });
    await user.click(within(region).getByRole("button", { name: "Sketch this" }));
    expect(onUse).toHaveBeenCalledTimes(2);
  });
});
