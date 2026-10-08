import { Link } from "react-router-dom";
import { Avatar } from "../common/Avatar";
import { RsvpButtons } from "./RsvpButtons";
import { formatWhen, untilText } from "../../lib/when";
import type { CommunityEvent } from "../../types";
import { t } from "../../i18n";

/** How long after it began an event with no end time is still going (the same as the server's). */
const OPEN_AFTER_START_MS = 6 * 60 * 60 * 1000;

/** Whether an event has finished, and so can't be answered any more. */
export function isOver(event: CommunityEvent, now: Date = new Date()): boolean {
  const end = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime() + OPEN_AFTER_START_MS;
  return end < now.getTime();
}

/** "Where": the place, or "Online". */
export function whereText(event: CommunityEvent): string {
  return event.kind === "online" ? t("events.online") : event.place;
}

export function EventCard({ event, onChange, now = new Date() }: { event: CommunityEvent; onChange: (event: CommunityEvent) => void; now?: Date }) {
  const over = isOver(event, now);
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">
            <Link to={`/events/${event.id}`} className="hover:underline">
              {event.title}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-white/80">
            {formatWhen(event.startsAt)} · <span className="text-white/60">{untilText(event.startsAt, now)}</span>
          </p>
          <p className="text-sm text-white/70">{whereText(event)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">{event.audience === "friends" ? t("nav.friends") : t("events.public")}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Link to={`/u/${event.host.username}`} className="flex items-center gap-1.5 hover:underline">
            <Avatar username={event.host.username} displayName={event.host.displayName} avatarUrl={event.host.avatarUrl} size={20} />
            {event.isHost ? t("groups.you") : event.host.displayName}
          </Link>
          <span aria-hidden>·</span>
          <span>
            {event.maybeCount > 0 ? t("events.goingMaybe", { going: event.goingCount, maybe: event.maybeCount }) : t("events.goingOnly", { going: event.goingCount })}
          </span>
        </div>
        {!event.isHost && !over && <RsvpButtons event={event} onAnswered={(change) => onChange({ ...event, ...change })} />}
        {event.isHost && (
          <Link to={`/events/${event.id}`} className="text-xs text-violet-300 hover:underline">
            {t("events.manage")}
          </Link>
        )}
      </div>
    </article>
  );
}
