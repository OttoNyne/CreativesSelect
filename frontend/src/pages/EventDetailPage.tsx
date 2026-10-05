import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { eventsApi } from "../api/events.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/common/Avatar";
import { EditedMark } from "../components/common/EditedMark";
import { EventForm } from "../components/events/EventForm";
import { RsvpButtons } from "../components/events/RsvpButtons";
import { isOver } from "../components/events/EventCard";
import { formatWhen, untilText } from "../lib/when";
import type { CommunityEvent, EventAnswer, User } from "../types";

/** One group of guests (going, or maybe), fifty at a time. */
function Guests({ eventId, status, total }: { eventId: string; status: EventAnswer; total: number }) {
  const [guests, setGuests] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // reload whenever the number changes (someone answered, or took an answer back)
  useEffect(() => {
    let current = true;
    eventsApi
      .guests(eventId, status)
      .then(({ guests, hasMore }) => {
        if (!current) return;
        setGuests(guests);
        setPage(1);
        setHasMore(hasMore);
      })
      .catch((err) => current && setError(err instanceof ApiError ? err.message : "Couldn't load the guest list."))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [eventId, status, total]);

  async function showMore() {
    try {
      const next = await eventsApi.guests(eventId, status, page + 1);
      setGuests((old) => [...old, ...next.guests.filter((g) => !old.some((o) => o.id === g.id))]);
      setPage(page + 1);
      setHasMore(next.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load more.");
    }
  }

  const title = status === "going" ? "Going" : "Maybe";
  return (
    <section aria-label={`${title} (${total})`}>
      <h2 className="text-sm font-semibold text-white/80">
        {title} <span className="text-white/60">({total})</span>
      </h2>
      {loading && <p className="mt-1 text-xs text-white/60">Loading…</p>}
      {!loading && guests.length === 0 && !error && <p className="mt-1 text-xs text-white/60">Nobody yet.</p>}
      <ul className="mt-2 flex flex-wrap gap-2">
        {guests.map((g) => (
          <li key={g.id}>
            <Link to={`/u/${g.username}`} className="flex items-center gap-1.5 rounded-full border border-white/10 py-0.5 pl-0.5 pr-2.5 text-xs text-white/80 hover:bg-white/10">
              <Avatar username={g.username} displayName={g.displayName} avatarUrl={g.avatarUrl} size={20} />
              {g.displayName}
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" onClick={showMore} className="mt-2 text-xs text-violet-300 hover:underline">
          Show more
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </section>
  );
}

export function EventDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<CommunityEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let current = true;
    eventsApi
      .get(id)
      .then(({ event }) => current && setEvent(event))
      .catch((err) => current && setError(err instanceof ApiError ? err.message : "Couldn't load this event."));
    return () => {
      current = false;
    };
  }, [id]);

  async function cancelEvent(e: CommunityEvent) {
    if (!window.confirm(`Cancel "${e.title}"? The people who answered will be told.`)) return;
    try {
      await eventsApi.cancel(e.id);
      navigate("/events");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel that event.");
    }
  }

  async function report(e: CommunityEvent) {
    const reason = prompt("What's the issue with this event?");
    if (!reason) return;
    try {
      await moderationApi.report("event", e.id, reason);
      alert("Report submitted. Thanks for helping keep this space safe.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't submit that report.");
    }
  }

  const back = (
    <Link to="/events" className="text-sm text-violet-400 hover:underline">
      ← All events
    </Link>
  );

  if (error && !event) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
        {back}
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      </div>
    );
  }
  if (!event) return <div className="mx-auto max-w-2xl px-4 py-6 text-sm text-white/60">Loading…</div>;

  const over = isOver(event);
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      {back}
      {editing ? (
        <EventForm
          event={event}
          onSaved={(saved) => {
            setEvent(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <article className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 break-words text-xl font-semibold text-white">
              {event.title} <EditedMark editedAt={event.editedAt} />
            </h1>
            <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">{event.audience === "friends" ? "Friends" : "Public"}</span>
          </div>

          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-white/60">When</dt>
              <dd className="text-white/90">
                {formatWhen(event.startsAt)}
                {event.endsAt ? ` – ${formatWhen(event.endsAt)}` : ""} {!over && <span className="text-white/60">({untilText(event.startsAt)})</span>}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-white/60">Where</dt>
              <dd className="min-w-0 break-words text-white/90">
                {event.kind === "online" ? (
                  event.link ? (
                    <>
                      Online —{" "}
                      <a href={event.link} target="_blank" rel="noopener noreferrer nofollow" className="text-violet-300 hover:underline">
                        Join link
                      </a>{" "}
                      <span className="text-xs text-white/60">(opens another site)</span>
                    </>
                  ) : (
                    "Online (link to come)"
                  )
                ) : (
                  event.place
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-white/60">Host</dt>
              <dd>
                <Link to={`/u/${event.host.username}`} className="flex items-center gap-1.5 text-white/90 hover:underline">
                  <Avatar username={event.host.username} displayName={event.host.displayName} avatarUrl={event.host.avatarUrl} size={20} />
                  {event.isHost ? "You" : event.host.displayName}
                </Link>
              </dd>
            </div>
          </dl>

          {event.description && <p className="whitespace-pre-line break-words text-sm text-white/80">{event.description}</p>}
          {over && <p className="text-sm text-amber-300">This event is over.</p>}

          <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
            {!event.isHost && !over && <RsvpButtons event={event} onAnswered={(change) => setEvent({ ...event, ...change })} />}
            {!over && (
              <a href={eventsApi.calendarUrl(event.id)} download="event.ics" className="text-xs text-violet-300 hover:underline">
                Add to calendar
              </a>
            )}
            {event.isHost && !over && (
              <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10">
                Edit
              </button>
            )}
            {event.isHost && (
              <button type="button" onClick={() => cancelEvent(event)} className="rounded-md border border-red-400/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">
                Cancel event
              </button>
            )}
            {!event.isHost && user && (
              <button type="button" onClick={() => report(event)} className="ml-auto text-xs text-white/60 hover:text-white hover:underline">
                Report
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </article>
      )}

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <Guests eventId={event.id} status="going" total={event.goingCount} />
        <Guests eventId={event.id} status="maybe" total={event.maybeCount} />
      </div>
    </div>
  );
}
