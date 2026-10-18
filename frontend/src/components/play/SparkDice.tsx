import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { encodeSpark, partText, PARTS, randomSpark, rerollPart, sparkOfDay, sparkText, type Spark, type SparkPart } from "../../lib/sparks";
import { t, type Key } from "../../i18n";

/**
 * Today's spark (the same for everyone) and a set of dice of your own: a subject, a twist and a rule. Tap a die to roll just that one again.
 * "Sketch this" opens the sketchpad with the spark, or (on the sketchpad itself, which passes `onUse`) puts it on the page you are drawing.
 */
export function SparkDice({ onUse }: { onUse?: (spark: Spark) => void }) {
  const today = useMemo(() => sparkOfDay(), []);
  const [rolled, setRolled] = useState<Spark | null>(null);

  const use = (spark: Spark, label: string) =>
    onUse ? (
      <button type="button" onClick={() => onUse(spark)} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
        {label}
      </button>
    ) : (
      <Link to={`/sketch?spark=${encodeSpark(spark)}`} className="inline-block rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
        {label}
      </Link>
    );

  return (
    <section aria-label={t("play.sparkTitle")} className="space-y-4 rounded-xl border border-violet-400/30 bg-violet-500/10 p-4">
      <h2 className="text-sm font-semibold text-white">{t("play.sparkTitle")}</h2>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-violet-200">{t("play.sparkOfDay")}</p>
        <p dir="auto" className="text-lg font-semibold text-white">
          {sparkText(today)}
        </p>
        <p className="text-xs text-white/70">{t("play.sparkSame")}</p>
        <div className="pt-1">{use(today, onUse ? t("play.useToday") : t("play.useSpark"))}</div>
      </div>

      <div className="space-y-2 border-t border-white/10 pt-3">
        <button type="button" onClick={() => setRolled(randomSpark())} className="rounded-md border border-white/25 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10">
          {t("play.roll")}
        </button>
        {rolled && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-violet-200">{t("play.yourRoll")}</p>
            <ul className="grid gap-2 sm:grid-cols-3">
              {PARTS.map((part: SparkPart) => (
                <li key={part}>
                  <button
                    type="button"
                    onClick={() => setRolled(rerollPart(rolled, part))}
                    aria-label={`${t("play.rollPart", { part: t(`play.part.${part}` as Key) })}: ${partText(part, rolled[part])}`}
                    className="w-full rounded-lg border border-white/20 bg-black/30 p-3 text-start hover:border-violet-300 hover:bg-white/10"
                  >
                    <span className="block text-xs text-white/60">{t(`play.part.${part}` as Key)}</span>
                    {/* the result is re-keyed so each new roll fades in */}
                    <span key={rolled[part]} dir="auto" className="cs-fade-in mt-0.5 block text-sm font-medium text-white">
                      {partText(part, rolled[part])}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {use(rolled, t("play.useSpark"))}
          </div>
        )}
      </div>
    </section>
  );
}
