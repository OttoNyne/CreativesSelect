import { useState } from "react";
import { EVENT_LIMITS, eventsApi, type EventInput } from "../../api/events.api";
import { ApiError } from "../../api/client";
import { earliestStart, toLocalInput } from "../../lib/when";
import type { CommunityEvent } from "../../types";
import { t } from "../../i18n";

const field = "w-full min-w-0 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";
const label = "block text-xs font-medium text-white/70";

/**
 * Plan an event, or (with `event`) change one. Friends are told when one is made; people who answered are told if the time or place
 * changes. A change only sends what was actually changed, so an event that has already begun can still have its words fixed.
 */
export function EventForm({ event, onSaved, onCancel }: { event?: CommunityEvent; onSaved: (event: CommunityEvent) => void; onCancel?: () => void }) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<"in_person" | "online">(event?.kind ?? "in_person");
  const [place, setPlace] = useState(event?.place ?? "");
  const [link, setLink] = useState(event?.link ?? "");
  const [startsAt, setStartsAt] = useState(event ? toLocalInput(event.startsAt) : "");
  const [endsAt, setEndsAt] = useState(event?.endsAt ? toLocalInput(event.endsAt) : "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [audience, setAudience] = useState<"friends" | "public">(event?.audience ?? "friends");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const name = title.trim();
    if (!name) return setError(t("events.giveYourEventA"));
    if (kind === "in_person" && !place.trim()) return setError(t("events.sayWhereItIs"));
    const start = new Date(startsAt);
    if (!startsAt || Number.isNaN(start.getTime())) return setError(t("events.chooseAStartTime"));
    const end = endsAt ? new Date(endsAt) : null;
    if (end && Number.isNaN(end.getTime())) return setError(t("events.chooseAValidEnd"));

    const input: EventInput = { title: name, kind, description, audience };
    if (kind === "in_person") input.place = place.trim();
    else input.link = link.trim();
    if (!event) {
      input.startsAt = start.toISOString();
      if (end) input.endsAt = end.toISOString();
    } else {
      // compared as the boxes show them (to the minute), so leaving a time alone never counts as changing it
      if (startsAt !== toLocalInput(event.startsAt)) input.startsAt = start.toISOString();
      if (endsAt !== (event.endsAt ? toLocalInput(event.endsAt) : "")) input.endsAt = end ? end.toISOString() : null;
    }

    setBusy(true);
    setError(null);
    try {
      const { event: saved } = event ? await eventsApi.update(event.id, input) : await eventsApi.create(input);
      onSaved(saved);
      if (!event) {
        setTitle("");
        setPlace("");
        setLink("");
        setStartsAt("");
        setEndsAt("");
        setDescription("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("events.couldntSaveThatEvent"));
    } finally {
      setBusy(false);
    }
  }

  const heading = event ? t("events.changeEvent") : t("events.planAnEvent");
  return (
    <form onSubmit={submit} aria-label={heading} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{heading}</h2>
      <div>
        <label htmlFor="event-title" className={label}>
          {t("events.title")}
        </label>
        <input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={EVENT_LIMITS.title} placeholder={t("events.lifeDrawingNight")} className={field} />
      </div>

      <fieldset>
        <legend className={label}>{t("events.where")}</legend>
        <div className="mt-1 flex gap-4 text-sm text-white/80">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="event-kind" checked={kind === "in_person"} onChange={() => setKind("in_person")} /> {t("events.inPerson")}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="event-kind" checked={kind === "online"} onChange={() => setKind("online")} /> {t("events.online")}
          </label>
        </div>
        {kind === "in_person" ? (
          <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={EVENT_LIMITS.place} placeholder={t("events.theOldMillLeeds")} aria-label={t("events.place")} className={`${field} mt-2`} />
        ) : (
          <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={EVENT_LIMITS.link} placeholder={t("events.httpsALinkTo")} aria-label={t("events.linkToJoin")} inputMode="url" className={`${field} mt-2`} />
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="event-start" className={label}>
            {t("events.starts")}
          </label>
          <input id="event-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} min={event ? undefined : earliestStart()} className={`${field} [color-scheme:dark]`} />
        </div>
        <div>
          <label htmlFor="event-end" className={label}>
            {t("events.endsOptional")}
          </label>
          <input id="event-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={startsAt || undefined} className={`${field} [color-scheme:dark]`} />
        </div>
      </div>

      <div>
        <label htmlFor="event-description" className={label}>
          {t("events.detailsOptional")}
        </label>
        <textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={EVENT_LIMITS.description} rows={3} placeholder={t("events.whatToBringWho")} className={field} />
        <p className="mt-1 text-end text-xs text-white/60">
          {description.length} / {EVENT_LIMITS.description}
        </p>
      </div>

      <div>
        <label htmlFor="event-audience" className={label}>
          {t("events.whoCanSeeIt")}
        </label>
        <select id="event-audience" value={audience} onChange={(e) => setAudience(e.target.value as "friends" | "public")} className={field}>
          <option value="friends">{t("events.myFriends")}</option>
          <option value="public">{t("events.everyoneWhoCanSee")}</option>
        </select>
      </div>

      <p className="text-xs text-white/60">{event ? t("events.peopleWhoAnsweredAre") : t("events.yourFriendsAreTold")}</p>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? t("reset.saving") : event ? t("profile.saveChanges") : t("events.planEvent")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-white/70 hover:underline disabled:opacity-50">
            {t("common.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
