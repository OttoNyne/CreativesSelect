import { useState } from "react";
import { MAX_SCHEDULED_TITLE_LENGTH, scheduledApi } from "../../api/scheduled.api";
import { ApiError } from "../../api/client";
import { earliestStart } from "../../lib/when";
import type { ScheduledLive } from "../../types";
import { t } from "../../i18n";

/** Plan a live for later: a title and a time. Friends are told, and anyone who can see you can ask for a reminder. */
export function ScheduleLive({ onScheduled }: { onScheduled: (plan: ScheduledLive) => void }) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return setError(t("live.giveYourLiveA"));
    const start = new Date(when);
    if (!when || Number.isNaN(start.getTime())) return setError(t("events.chooseAStartTime"));
    setBusy(true);
    setError(null);
    try {
      const { scheduled } = await scheduledApi.create(name, start.toISOString());
      onScheduled(scheduled);
      setTitle("");
      setWhen("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("live.couldntScheduleThatLive"));
    } finally {
      setBusy(false);
    }
  }

  const field = "min-w-0 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";
  return (
    <form onSubmit={submit} aria-label={t("live.scheduleALive")} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{t("live.scheduleALive")}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_SCHEDULED_TITLE_LENGTH} placeholder={t("live.whatWillItBe")} aria-label={t("live.planTitle")} className={field} />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} min={earliestStart()} aria-label={t("live.startTime")} className={`${field} [color-scheme:dark]`} />
        <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? t("live.scheduling") : t("live.schedule")}
        </button>
      </div>
      <p className="mt-2 text-xs text-white/60">{t("live.yourFriendsAreTold")}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
