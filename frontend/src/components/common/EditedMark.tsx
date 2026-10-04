import { formatDay } from "../../lib/when";

/** "(edited)" beside something its author has changed, with the day in the tooltip. Nothing if it was never changed. */
export function EditedMark({ editedAt, className = "text-white/60" }: { editedAt?: string | null; className?: string }) {
  if (!editedAt) return null;
  return (
    <span title={`Edited ${formatDay(editedAt)}`} className={`text-xs ${className}`}>
      (edited)
    </span>
  );
}
