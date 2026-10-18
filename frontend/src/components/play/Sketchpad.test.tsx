import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sketchpad } from "./Sketchpad";

const calls: string[] = [];
const ctx = {
  strokeStyle: "",
  fillStyle: "",
  lineWidth: 0,
  beginPath: () => {},
  moveTo: () => {},
  quadraticCurveTo: () => {},
  arc: () => {},
  fill: () => calls.push(`fill ${ctx.fillStyle}`),
  stroke: () => calls.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth}`),
  fillRect: () => calls.push("blank"),
};

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

function show() {
  const canvasRef = createRef<HTMLCanvasElement>();
  const onStrokes = vi.fn();
  render(<Sketchpad canvasRef={canvasRef} onStrokes={onStrokes} />);
  return { onStrokes, canvas: screen.getByRole("img", { name: /Drawing area/ }) };
}

/** One stroke: press, move to a second place, let go. */
function draw(canvas: HTMLElement, id = 1) {
  fireEvent.pointerDown(canvas, { pointerId: id, clientX: 10, clientY: 10, button: 0 });
  fireEvent.pointerMove(canvas, { pointerId: id, clientX: 60, clientY: 40 });
  fireEvent.pointerUp(canvas, { pointerId: id, clientX: 60, clientY: 40 });
}

describe("Sketchpad", () => {
  it("starts blank, with nothing to undo, redo or clear", () => {
    const { onStrokes } = show();
    expect(onStrokes).toHaveBeenLastCalledWith(0);
    for (const name of ["Undo", "Redo", "Clear"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(calls).toContain("blank");
  });

  it("counts a stroke when the pen lifts, and keeps the page free of scrolling while drawing", () => {
    const { onStrokes, canvas } = show();
    expect(canvas).toHaveStyle({ touchAction: "none" });
    draw(canvas);
    expect(onStrokes).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  it("undoes and redoes strokes, and drawing again after an undo forgets what could have been redone", async () => {
    const user = userEvent.setup();
    const { onStrokes, canvas } = show();
    draw(canvas);
    draw(canvas);
    expect(onStrokes).toHaveBeenLastCalledWith(2);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onStrokes).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(onStrokes).toHaveBeenLastCalledWith(2);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    draw(canvas);
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("undoes with Ctrl+Z and redoes with Ctrl+Shift+Z, but not while typing in a field", async () => {
    const { onStrokes, canvas } = show();
    draw(canvas);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(onStrokes).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(onStrokes).toHaveBeenLastCalledWith(1);
    const field = document.createElement("input");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "z", ctrlKey: true });
    expect(onStrokes).toHaveBeenLastCalledWith(1);
    field.remove();
  });

  it("asks before clearing: the first press asks, the second clears", async () => {
    const user = userEvent.setup();
    const { onStrokes, canvas } = show();
    draw(canvas);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onStrokes).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Clear everything?" }));
    expect(onStrokes).toHaveBeenLastCalledWith(0);
    expect(localStorage.getItem("cs-sketch-draft")).toBeNull();
  });

  it("draws in the colour, size and tool that are chosen, and an eraser paints the paper back", async () => {
    const user = userEvent.setup();
    const { canvas } = show();
    await user.click(screen.getByRole("button", { name: "Red" }));
    expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Brush size 24" }));
    draw(canvas);
    expect(calls).toContain("stroke #e5484d 24");
    await user.click(screen.getByRole("button", { name: "Eraser" }));
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "false");
    draw(canvas);
    expect(calls.some((c) => c.startsWith("stroke #fffdf8"))).toBe(true);
    // choosing a colour again goes back to the pen
    await user.click(screen.getByRole("button", { name: "Blue" }));
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "false");
  });

  it("follows only the finger that started the line, and ignores the mouse's other buttons", () => {
    const { onStrokes, canvas } = show();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 99, clientY: 99 });
    fireEvent.pointerUp(canvas, { pointerId: 2 });
    expect(onStrokes).toHaveBeenLastCalledWith(0);
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(onStrokes).toHaveBeenLastCalledWith(1);
  });

  it("keeps a line whose end was missed (the pen let go outside the window) when the next line starts, and ends one when the pointer is lost", () => {
    const { onStrokes, canvas } = show();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
    // no pointer up: the same pointer starts again
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 90, clientY: 90, button: 0 });
    expect(onStrokes).toHaveBeenLastCalledWith(1);
    fireEvent.lostPointerCapture(canvas, { pointerId: 1 });
    expect(onStrokes).toHaveBeenLastCalledWith(2);
  });

  it("keeps an unfinished drawing on this device and brings it back after a reload", () => {
    const first = show();
    draw(first.canvas);
    expect(localStorage.getItem("cs-sketch-draft")).not.toBeNull();
    document.body.innerHTML = "";
    const second = show();
    expect(second.onStrokes).toHaveBeenLastCalledWith(1);
  });
});
