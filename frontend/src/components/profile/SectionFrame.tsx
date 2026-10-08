import type { ReactNode } from "react";
import { SECTION_LABELS, type SectionKey } from "../../lib/sections";

interface Props {
  section: SectionKey;
  position: number;
  total: number;
  hidden: boolean;
  disabled?: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggleHidden: () => void;
  children: ReactNode;
}

/** Around a section while its owner is editing: buttons to move it up or down and to hide it from visitors. */
export function SectionFrame({ section, position, total, hidden, disabled, onMove, onToggleHidden, children }: Props) {
  const label = SECTION_LABELS[section];
  const button = "rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div role="group" aria-label={`${label} section`} className={`rounded-xl border border-dashed border-white/25 p-2 ${hidden ? "opacity-60" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
          {label} <span className="font-normal normal-case text-white/60">({position} of {total})</span>
        </span>
        {hidden && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">Hidden from visitors</span>}
        <span className="ms-auto flex gap-1.5">
          <button type="button" onClick={() => onMove(-1)} disabled={disabled || position === 1} aria-label={`Move ${label} up`} className={button}>
            ↑ Up
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={disabled || position === total} aria-label={`Move ${label} down`} className={button}>
            ↓ Down
          </button>
          <button type="button" onClick={onToggleHidden} disabled={disabled} aria-label={`${hidden ? "Show" : "Hide"} ${label}`} aria-pressed={hidden} className={button}>
            {hidden ? "Show" : "Hide"}
          </button>
        </span>
      </div>
      {children}
    </div>
  );
}
