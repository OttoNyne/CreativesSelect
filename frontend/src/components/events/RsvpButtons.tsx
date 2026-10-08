import { useState } from "react";
import { eventsApi } from "../../api/events.api";
import { ApiError } from "../../api/client";
import type { CommunityEvent, EventAnswer } from "../../types";
import { t } from "../../i18n";

/** Going / Maybe, and taking the answer back by choosing it again. Tells the page the new answer and counts. */
export function RsvpButtons({ event, onAnswered }: { event: CommunityEvent; onAnswered: (change: Pick<CommunityEvent, "myStatus" | "goingCount" | "maybeCount">) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(status: EventAnswer) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onAnswered(await eventsApi.rsvp(event.id, event.myStatus === status ? "none" : status));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("events.couldntSaveYourAnswer"));
    } finally {
      setBusy(false);
    }
  }

  const pill = (status: EventAnswer, text: string, on: string) => (
    <button
      type="button"
      onClick={() => choose(status)}
      disabled={busy}
      aria-pressed={event.myStatus === status}
      className={`rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-60 ${event.myStatus === status ? on : "border-white/20 text-white/80 hover:bg-white/10"}`}
    >
      {text}
    </button>
  );

  return (
    <div>
      <div className="flex gap-2">
        {pill("going", t("events.going"), "border-emerald-400/60 bg-emerald-500/20 text-emerald-200")}
        {pill("maybe", t("events.maybe"), "border-amber-400/60 bg-amber-500/20 text-amber-200")}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
