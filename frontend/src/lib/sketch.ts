// The drawing behind the sketchpad: a drawing is a list of strokes, and the picture is always drawn again from that list, which is what
// makes undo, redo and clear simple.

export const SKETCH_WIDTH = 1200;
export const SKETCH_HEIGHT = 900;
export const PAPER = "#fffdf8";
export const BRUSH_SIZES = [4, 10, 24] as const;
export const SWATCHES = [
  { name: "black", value: "#1b1b1f" },
  { name: "red", value: "#e5484d" },
  { name: "orange", value: "#f76b15" },
  { name: "yellow", value: "#f5c518" },
  { name: "green", value: "#30a46c" },
  { name: "blue", value: "#0090ff" },
  { name: "violet", value: "#8e4ec6" },
  { name: "brown", value: "#8b5e3c" },
] as const;

export type Point = [number, number];
export type Stroke = { color: string; size: number; erase: boolean; points: Point[] };

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function setUp(ctx: CanvasRenderingContext2D, stroke: Pick<Stroke, "color" | "size" | "erase">) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.size;
  ctx.strokeStyle = stroke.erase ? PAPER : stroke.color;
  ctx.fillStyle = stroke.erase ? PAPER : stroke.color;
}

/** Draws the next bit of a line that is being drawn: from the middle of the last two points to the middle of the newest two. */
export function drawSegment(ctx: CanvasRenderingContext2D, stroke: Stroke, from: number) {
  const { points } = stroke;
  setUp(ctx, stroke);
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = Math.max(1, from); i < points.length; i++) {
    const start = i === 1 ? points[0] : mid(points[i - 2], points[i - 1]);
    const end = i === points.length - 1 ? points[i] : mid(points[i - 1], points[i]);
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.quadraticCurveTo(points[i - 1][0], points[i - 1][1], end[0], end[1]);
    ctx.stroke();
  }
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  drawSegment(ctx, stroke, 1);
}

/** The blank page (the size of the sketchpad's, or another), then every stroke on it. */
export function redraw(ctx: CanvasRenderingContext2D, strokes: Stroke[], width = SKETCH_WIDTH, height = SKETCH_HEIGHT) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

export const DRAFT_KEY = "cs-sketch-draft";
const MAX_DRAFT_CHARS = 400_000;

const isStroke = (s: unknown): s is Stroke => {
  const stroke = s as Stroke;
  return (
    Boolean(stroke) &&
    typeof stroke.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(stroke.color) &&
    typeof stroke.size === "number" &&
    typeof stroke.erase === "boolean" &&
    Array.isArray(stroke.points) &&
    stroke.points.length > 0 &&
    stroke.points.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  );
};

/** An unfinished drawing kept on this device, so a refresh or a closed tab doesn't lose it. */
export function loadDraft(key = DRAFT_KEY): Stroke[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isStroke) : [];
  } catch {
    return [];
  }
}

export function saveDraft(strokes: Stroke[], key = DRAFT_KEY) {
  try {
    if (!strokes.length) return localStorage.removeItem(key);
    const text = JSON.stringify(strokes.map((s) => ({ ...s, points: s.points.map((p) => [Math.round(p[0]), Math.round(p[1])]) })));
    // a drawing too big to keep is simply not kept
    if (text.length <= MAX_DRAFT_CHARS) localStorage.setItem(key, text);
  } catch {
    // storage unavailable (private window, full): the drawing just isn't kept
  }
}

export const clearDraft = (key = DRAFT_KEY) => saveDraft([], key);
