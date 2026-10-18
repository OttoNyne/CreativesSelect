import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { BRUSH_SIZES, DRAFT_KEY, SKETCH_HEIGHT, SKETCH_WIDTH, SWATCHES, clearDraft, drawSegment, loadDraft, redraw, saveDraft, type Stroke } from "../../lib/sketch";
import { t, type Key } from "../../i18n";

const button = "rounded-md border px-3 py-1.5 text-sm disabled:opacity-40";
const idle = "border-white/20 text-white hover:bg-white/10";
const active = "border-violet-400 bg-violet-500/25 text-white";

type Drawing = { strokes: Stroke[]; redoable: Stroke[] };
type Action = { type: "add"; stroke: Stroke } | { type: "undo" } | { type: "redo" } | { type: "clear" };

/** Drawing something new ends any chance to redo what was undone, like every drawing program. */
function drawingReducer(state: Drawing, action: Action): Drawing {
  switch (action.type) {
    case "add":
      return { strokes: [...state.strokes, action.stroke], redoable: [] };
    case "undo":
      return state.strokes.length ? { strokes: state.strokes.slice(0, -1), redoable: [...state.redoable, state.strokes[state.strokes.length - 1]] } : state;
    case "redo":
      return state.redoable.length ? { strokes: [...state.strokes, state.redoable[state.redoable.length - 1]], redoable: state.redoable.slice(0, -1) } : state;
    case "clear":
      return { strokes: [], redoable: [] };
  }
}

/**
 * A drawing surface: a pen and an eraser, colours and three brush sizes, undo, redo and clear. It works with a finger, a pen or a mouse.
 * The page that holds it gets the canvas (to turn into a picture) and is told how many strokes there are (to know there is something to post).
 */
export function Sketchpad({
  canvasRef,
  onStrokes,
  width = SKETCH_WIDTH,
  height = SKETCH_HEIGHT,
  draftKey = DRAFT_KEY,
  above,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onStrokes: (count: number) => void;
  /** The size of the page in drawing units (the picture made is this many pixels wide and high). */
  width?: number;
  height?: number;
  /** Where an unfinished drawing is kept on this device; each kind of drawing has its own. */
  draftKey?: string;
  /** Something shown directly above the page, as wide as it (the strip a chain's next part carries on from). */
  above?: ReactNode;
}) {
  const [{ strokes, redoable }, dispatch] = useReducer(drawingReducer, draftKey, (key) => ({ strokes: loadDraft(key), redoable: [] }));
  const [erasing, setErasing] = useState(false);
  const [color, setColor] = useState<string>(SWATCHES[0].value);
  const [size, setSize] = useState<number>(BRUSH_SIZES[1]);
  const [sure, setSure] = useState(false);
  const live = useRef<{ stroke: Stroke; pointer: number } | null>(null);

  const context = useCallback(() => canvasRef.current?.getContext("2d") ?? null, [canvasRef]);

  // the page is drawn again whenever the list of strokes changes (and once at the start)
  useEffect(() => {
    const ctx = context();
    if (ctx) redraw(ctx, strokes, width, height);
    onStrokes(strokes.length);
    saveDraft(strokes, draftKey);
  }, [strokes, context, onStrokes, width, height, draftKey]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * width) / (rect.width || width);
    const y = ((e.clientY - rect.top) * height) / (rect.height || height);
    return [Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y))];
  };

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // a second finger while one is drawing is ignored (a resting palm); the same pointer starting again means its end was missed, so that line is kept
    if (live.current && live.current.pointer !== e.pointerId) return;
    if (live.current) dispatch({ type: "add", stroke: live.current.stroke });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const stroke: Stroke = { color, size: erasing ? size * 1.8 : size, erase: erasing, points: [pointAt(e)] };
    live.current = { stroke, pointer: e.pointerId };
    const ctx = context();
    if (ctx) drawSegment(ctx, stroke, 1);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const drawing = live.current;
    if (!drawing || drawing.pointer !== e.pointerId) return;
    const before = drawing.stroke.points.length;
    drawing.stroke.points.push(pointAt(e));
    const ctx = context();
    if (ctx) drawSegment(ctx, drawing.stroke, before);
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    const drawing = live.current;
    if (!drawing || drawing.pointer !== e.pointerId) return;
    live.current = null;
    dispatch({ type: "add", stroke: drawing.stroke });
  }

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, unless the person is typing in a field
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function clear() {
    if (!sure) return setSure(true);
    setSure(false);
    dispatch({ type: "clear" });
    clearDraft(draftKey);
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label={t("play.tools")} className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={!erasing} onClick={() => setErasing(false)} className={`${button} ${!erasing ? active : idle}`}>
          {t("play.pen")}
        </button>
        <button type="button" aria-pressed={erasing} onClick={() => setErasing(true)} className={`${button} ${erasing ? active : idle}`}>
          {t("play.eraser")}
        </button>
        <button type="button" onClick={undo} disabled={!strokes.length} className={`${button} ${idle}`}>
          {t("play.undo")}
        </button>
        <button type="button" onClick={redo} disabled={!redoable.length} className={`${button} ${idle}`}>
          {t("play.redo")}
        </button>
        <button type="button" onClick={clear} onBlur={() => setSure(false)} disabled={!strokes.length} className={`${button} ${sure ? "border-red-400 bg-red-500/20 text-white" : idle}`}>
          {sure ? t("play.clearSure") : t("play.clear")}
        </button>
      </div>

      <div role="group" aria-label={t("play.colors")} className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((swatch) => {
          const label = t(`play.color.${swatch.name}` as Key);
          const chosen = !erasing && color === swatch.value;
          return (
            <button
              key={swatch.name}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={chosen}
              onClick={() => {
                setColor(swatch.value);
                setErasing(false);
              }}
              style={{ backgroundColor: swatch.value }}
              className={`size-8 rounded-full border-2 ${chosen ? "border-white ring-2 ring-violet-400" : "border-white/30"}`}
            />
          );
        })}
        <label className="flex items-center gap-2 text-sm text-white/80">
          <span className="sr-only">{t("play.colorPicker")}</span>
          <input
            type="color"
            value={color}
            title={t("play.colorPicker")}
            onChange={(e) => {
              setColor(e.target.value);
              setErasing(false);
            }}
            className="size-8 cursor-pointer rounded border border-white/30 bg-transparent p-0"
          />
        </label>
      </div>

      <div role="group" aria-label={t("play.size")} className="flex items-center gap-2">
        <span className="text-sm text-white/70">{t("play.size")}</span>
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`${t("play.size")} ${s}`}
            aria-pressed={size === s}
            onClick={() => setSize(s)}
            className={`flex size-9 items-center justify-center rounded-md border ${size === s ? active : idle}`}
          >
            <span className="rounded-full bg-white" style={{ width: Math.max(4, s / 1.6), height: Math.max(4, s / 1.6) }} />
          </button>
        ))}
      </div>

      {/* the tools sit above the page so they stay in view while drawing; the page is never taller than most of the screen */}
      <div className="mx-auto" style={{ maxWidth: `min(100%, calc(62vh * ${width / height}))` }}>
        {above}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          role="img"
          aria-label={t("play.canvasLabel")}
          data-testid="sketch-canvas"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          // the page must not scroll or zoom while a finger is drawing
          style={{ touchAction: "none", aspectRatio: `${width} / ${height}` }}
          className="block w-full cursor-crosshair rounded-lg border border-white/20 bg-[#fffdf8]"
        />
      </div>
    </div>
  );
}
