import { useMemo } from "react";
import { Link } from "react-router-dom";
import { encodeSpark, sparkOfDay, sparkText } from "../../lib/sparks";
import { t } from "../../i18n";

/** A small card on the feed: today's spark, with a way straight into the sketchpad (and one to the sketchpad with nothing chosen). */
export function SparkStrip() {
  const today = useMemo(() => sparkOfDay(), []);
  return (
    <section aria-label={t("play.sparkOfDay")} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-violet-200">{t("play.sparkOfDay")}</p>
        <p dir="auto" className="text-sm font-medium text-white">
          {sparkText(today)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link to={`/sketch?spark=${encodeSpark(today)}`} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
          {t("play.useSpark")}
        </Link>
        <Link to="/sketch" className="text-sm text-violet-300 hover:underline">
          {t("play.stripOpen")}
        </Link>
      </div>
    </section>
  );
}
