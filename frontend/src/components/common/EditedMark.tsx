import { formatDay } from "../../lib/when";
import { t } from "../../i18n";

/** "(edited)" beside something its author has changed, with the day in the tooltip. Nothing if it was never changed. */
export function EditedMark({ editedAt, className = "text-white/60" }: { editedAt?: string | null; className?: string }) {
  if (!editedAt) return null;
  return (
    <span title={t("edit.editedOn", { day: formatDay(editedAt) })} className={`text-xs ${className}`}>
      {t("edit.mark")}
    </span>
  );
}
