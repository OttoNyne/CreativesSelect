import { useRef } from "react";
import { FramedImage } from "../common/FramedImage";
import {
  ASPECT_OPTIONS,
  DEFAULT_FRAMING,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  formatPosition,
  isDefaultFraming,
  parsePosition,
  type ImageFraming,
} from "../../lib/framing";
import { t } from "../../i18n";

const slider = "w-full accent-violet-500";

// Lets someone set a picture's shape, size (zoom) and placement before they post it. They can drag
// the preview to move the picture, or use the sliders (which also work from a keyboard).
export function ImageAdjuster({ src, value, onChange }: { src?: string; value: ImageFraming; onChange: (next: ImageFraming) => void }) {
  const [x, y] = parsePosition(value.position);
  const drag = useRef<{ startX: number; startY: number; fromX: number; fromY: number; w: number; h: number } | null>(null);
  const positionMatters = value.aspect !== "original" || value.zoom > 1;

  function setPosition(nx: number, ny: number) {
    onChange({ ...value, position: formatPosition(nx, ny) });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!positionMatters) return;
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { startX: e.clientX, startY: e.clientY, fromX: x, fromY: y, w: rect.width || 1, h: rect.height || 1 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // dragging the picture to the right reveals more of its left side, so the position moves the other way
    setPosition(d.fromX - ((e.clientX - d.startX) / d.w) * 100, d.fromY - ((e.clientY - d.startY) / d.h) * 100);
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div
        data-testid="adjust-preview"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`mx-auto max-w-md touch-none rounded-lg border border-white/10 ${positionMatters ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <FramedImage src={src} aspect={value.aspect} zoom={value.zoom} position={value.position} className="rounded-lg" />
      </div>

      <div role="group" aria-label={t("adjust.shapeGroup")} className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-[11px] uppercase tracking-wide text-white/60">{t("adjust.shape")}</span>
        {ASPECT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value.aspect === o.value}
            onClick={() => onChange({ ...value, aspect: o.value })}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              value.aspect === o.value ? "border-violet-500 bg-violet-500/20 text-white" : "border-white/15 text-white/70 hover:bg-white/10"
            }`}
          >
            {t(o.labelKey)}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-[11px] text-white/60">
          {t("adjust.zoom")} <span className="text-white/70">{value.zoom.toFixed(2).replace(/\.?0+$/, "")}×</span>
          <input
            type="range"
            aria-label={t("adjust.zoom")}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={value.zoom}
            onChange={(e) => onChange({ ...value, zoom: clampZoom(Number(e.target.value)) })}
            className={slider}
          />
        </label>
        <label className="block text-[11px] text-white/60">
          {t("adjust.leftRight")}
          <input
            type="range"
            aria-label={t("adjust.moveLeftRight")}
            min={0}
            max={100}
            step={1}
            value={x}
            disabled={!positionMatters}
            onChange={(e) => setPosition(Number(e.target.value), y)}
            className={`${slider} disabled:opacity-40`}
          />
        </label>
        <label className="block text-[11px] text-white/60">
          {t("adjust.upDown")}
          <input
            type="range"
            aria-label={t("adjust.moveUpDown")}
            min={0}
            max={100}
            step={1}
            value={y}
            disabled={!positionMatters}
            onChange={(e) => setPosition(x, Number(e.target.value))}
            className={`${slider} disabled:opacity-40`}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-white/60">
          {positionMatters ? t("adjust.helpDrag") : t("adjust.helpPick")}
        </p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FRAMING)}
          disabled={isDefaultFraming(value)}
          className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          {t("adjust.reset")}
        </button>
      </div>
    </div>
  );
}
