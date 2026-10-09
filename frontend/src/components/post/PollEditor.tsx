import { t } from "../../i18n";

export const MAX_POLL_OPTIONS = 4;
export const MAX_POLL_OPTION = 60;
export type PollDays = 1 | 3 | 7;

/** The options of a poll being written (two to four), how long it stays open, and a way to drop it. */
export function PollEditor({ options, days, onOptions, onDays, onRemove }: { options: string[]; days: PollDays; onOptions: (options: string[]) => void; onDays: (days: PollDays) => void; onRemove: () => void }) {
  const set = (i: number, text: string) => onOptions(options.map((o, j) => (j === i ? text : o)));
  return (
    <fieldset className="mt-3 space-y-2 rounded-lg border border-white/10 p-3">
      <legend className="px-1 text-xs font-medium text-white/70">{t("polls.heading")}</legend>
      {options.map((text, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => set(i, e.target.value)}
            maxLength={MAX_POLL_OPTION}
            dir="auto"
            aria-label={t("polls.option", { n: i + 1 })}
            placeholder={t("polls.option", { n: i + 1 })}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          {options.length > 2 && (
            <button type="button" onClick={() => onOptions(options.filter((_, j) => j !== i))} aria-label={t("polls.removeOption", { n: i + 1 })} className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white">
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/70">
        {options.length < MAX_POLL_OPTIONS && (
          <button type="button" onClick={() => onOptions([...options, ""])} className="hover:text-white hover:underline">
            + {t("polls.addOption")}
          </button>
        )}
        <label className="flex items-center gap-2">
          {t("polls.length")}
          <select value={days} onChange={(e) => onDays(Number(e.target.value) as PollDays)} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white focus:border-violet-500 focus:outline-none">
            <option value={1}>{t("polls.oneDay")}</option>
            <option value={3}>{t("polls.threeDays")}</option>
            <option value={7}>{t("polls.sevenDays")}</option>
          </select>
        </label>
        <button type="button" onClick={onRemove} className="ms-auto hover:text-red-400 hover:underline">
          {t("polls.remove")}
        </button>
      </div>
    </fieldset>
  );
}
