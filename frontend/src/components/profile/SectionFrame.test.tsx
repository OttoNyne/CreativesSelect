import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionFrame } from "./SectionFrame";

function renderFrame(over: Partial<Parameters<typeof SectionFrame>[0]> = {}) {
  const onMove = vi.fn();
  const onToggleHidden = vi.fn();
  render(
    <SectionFrame section="music" position={2} total={5} hidden={false} onMove={onMove} onToggleHidden={onToggleHidden} {...over}>
      <p>the section</p>
    </SectionFrame>
  );
  return { onMove, onToggleHidden };
}

describe("SectionFrame", () => {
  it("names the section and where it is, and shows what is inside", () => {
    renderFrame();
    expect(screen.getByRole("group", { name: "Music section" })).toBeInTheDocument();
    expect(screen.getByText(/2 of 5/)).toBeInTheDocument();
    expect(screen.getByText("the section")).toBeInTheDocument();
    expect(screen.queryByText("Hidden from visitors")).not.toBeInTheDocument();
  });

  it("moves up or down, and hides", async () => {
    const { onMove, onToggleHidden } = renderFrame();
    await userEvent.click(screen.getByRole("button", { name: "Move Music up" }));
    expect(onMove).toHaveBeenLastCalledWith(-1);
    await userEvent.click(screen.getByRole("button", { name: "Move Music down" }));
    expect(onMove).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByRole("button", { name: "Hide Music" }));
    expect(onToggleHidden).toHaveBeenCalledTimes(1);
  });

  it("can't move the first one up or the last one down", () => {
    renderFrame({ position: 1 });
    expect(screen.getByRole("button", { name: "Move Music up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Music down" })).toBeEnabled();
  });

  it("can't move the last one down", () => {
    renderFrame({ position: 5 });
    expect(screen.getByRole("button", { name: "Move Music down" })).toBeDisabled();
  });

  it("says when it is hidden, and offers to show it", () => {
    renderFrame({ hidden: true });
    expect(screen.getByText("Hidden from visitors")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Music" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does nothing while a save is in progress", () => {
    renderFrame({ disabled: true });
    for (const name of ["Move Music up", "Move Music down", "Hide Music"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  });
});
