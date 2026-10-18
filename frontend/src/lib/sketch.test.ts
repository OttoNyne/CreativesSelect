import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAPER, SKETCH_HEIGHT, SKETCH_WIDTH, clearDraft, drawSegment, drawStroke, loadDraft, redraw, saveDraft, type Stroke } from "./sketch";

const fakeContext = () => {
  const calls: string[] = [];
  const ctx = {
    calls,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    beginPath: () => calls.push("begin"),
    moveTo: () => calls.push("move"),
    quadraticCurveTo: () => calls.push("curve"),
    stroke: () => calls.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth}`),
    arc: () => calls.push("arc"),
    fill: () => calls.push(`fill ${ctx.fillStyle}`),
    fillRect: (...a: number[]) => calls.push(`rect ${a.join(",")} ${ctx.fillStyle}`),
  };
  return ctx;
};
const asContext = (ctx: ReturnType<typeof fakeContext>) => ctx as unknown as CanvasRenderingContext2D;
const line: Stroke = { color: "#e5484d", size: 10, erase: false, points: [[0, 0], [10, 10], [20, 0], [30, 10]] };

describe("drawing strokes", () => {
  it("draws a single tap as a dot of the pen's colour", () => {
    const ctx = fakeContext();
    drawStroke(asContext(ctx), { ...line, points: [[5, 5]] });
    expect(ctx.calls).toEqual(["begin", "arc", "fill #e5484d"]);
  });

  it("draws a line as smooth curves, one for each point after the first", () => {
    const ctx = fakeContext();
    drawStroke(asContext(ctx), line);
    expect(ctx.calls.filter((c) => c === "curve")).toHaveLength(3);
    expect(ctx.calls.filter((c) => c.startsWith("stroke #e5484d 10"))).toHaveLength(3);
  });

  it("draws only the new bit when a line grows, so drawing stays fast", () => {
    const ctx = fakeContext();
    drawSegment(asContext(ctx), line, 3);
    expect(ctx.calls.filter((c) => c === "curve")).toHaveLength(1);
  });

  it("erases by painting the colour of the paper", () => {
    const ctx = fakeContext();
    drawStroke(asContext(ctx), { ...line, erase: true });
    expect(ctx.calls.some((c) => c.startsWith(`stroke ${PAPER}`))).toBe(true);
  });

  it("starts a redraw from a blank page, then puts every stroke back", () => {
    const ctx = fakeContext();
    redraw(asContext(ctx), [line, line]);
    expect(ctx.calls[0]).toBe(`rect 0,0,${SKETCH_WIDTH},${SKETCH_HEIGHT} ${PAPER}`);
    expect(ctx.calls.filter((c) => c === "curve")).toHaveLength(6);
  });
});

describe("the unfinished drawing kept on this device", () => {
  beforeEach(() => localStorage.clear());

  it("keeps a drawing and gives it back, and forgets it when it is cleared", () => {
    saveDraft([line]);
    expect(loadDraft()).toEqual([line]);
    clearDraft();
    expect(loadDraft()).toEqual([]);
    expect(localStorage.getItem("cs-sketch-draft")).toBeNull();
  });

  it("ignores anything that isn't a stroke, so a damaged draft can't break the page", () => {
    localStorage.setItem("cs-sketch-draft", JSON.stringify([line, { color: "red; background:url(x)", size: 4, erase: false, points: [[1, 2]] }, { color: "#000000", size: 4, erase: false, points: [["a", 1]] }, 7, null]));
    expect(loadDraft()).toEqual([line]);
    localStorage.setItem("cs-sketch-draft", "{not json");
    expect(loadDraft()).toEqual([]);
    localStorage.setItem("cs-sketch-draft", '{"strokes":1}');
    expect(loadDraft()).toEqual([]);
  });

  it("does not keep a drawing too big to store, and doesn't break when storage is unavailable", () => {
    const huge: Stroke = { ...line, points: Array.from({ length: 60_000 }, (_, i) => [i % 1200, i % 900] as [number, number]) };
    saveDraft([huge]);
    expect(localStorage.getItem("cs-sketch-draft")).toBeNull();
    const broken = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => saveDraft([line])).not.toThrow();
    broken.mockRestore();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadDraft()).toEqual([]);
    vi.restoreAllMocks();
  });
});
