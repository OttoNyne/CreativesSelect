import type { ReactNode } from "react";
import { SECTION_LABELS, type SectionKey } from "../../lib/sections";
import { t } from "../../i18n";

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
    <div role="group" aria-label={t("profile.sectionAria", { label })} className={`rounded-xl border border-dashed border-white/25 p-2 ${hidden ? "opacity-60" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
          {label} <span className="font-normal normal-case text-white/60">{t("profile.positionOf", { position, total })}</span>
        </span>
        {hidden && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">{t("profile.hiddenFromVisitors")}</span>}
        <span className="ms-auto flex gap-1.5">
          <button type="button" onClick={() => onMove(-1)} disabled={disabled || position === 1} aria-label={t("profile.moveSectionUp", { label })} className={button}>
            {t("profile.up")}
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={disabled || position === total} aria-label={t("profile.moveSectionDown", { label })} className={button}>
            {t("profile.down")}
          </button>
          <button type="button" onClick={onToggleHidden} disabled={disabled} aria-label={t(hidden ? "profile.showSection" : "profile.hideSection", { label })} aria-pressed={hidden} className={button}>
            {hidden ? t("profile.show") : t("profile.hide")}
          </button>
        </span>
      </div>
      {children}
    </div>
  );
}
