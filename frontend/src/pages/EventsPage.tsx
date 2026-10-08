import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { eventsApi, type EventFilter } from "../api/events.api";
import { ApiError } from "../api/client";
import { EventCard } from "../components/events/EventCard";
import { EventForm } from "../components/events/EventForm";
import type { CommunityEvent } from "../types";
import { t } from "../i18n";
import { tRich } from "../i18n/rich";

// looked up when the page draws, so the text is in the language of the page
const tabs = (): { filter: EventFilter; label: string; empty: string }[] => [
  { filter: "upcoming", label: t("events.comingUp"), empty: t("events.nothingPlanned") },
  { filter: "going", label: t("events.imGoing"), empty: t("events.notAnswered") },
  { filter: "mine", label: t("events.mine"), empty: t("events.noneMine") },
];

export function EventsPage() {
  const [filter, setFilter] = useState<EventFilter>("upcoming");
  const [events, setEvents] = useState<CommunityEvent[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    let current = true;
    eventsApi
      .list(filter)
      .then(({ events, hasMore }) => {
        if (!current) return;
        setEvents(events);
        setPage(1);
        setHasMore(hasMore);
      })
      .catch((err) => current && setError(err instanceof ApiError ? err.message : t("events.couldntLoadTheEvents")));
    return () => {
      current = false;
    };
  }, [filter]);

  function choose(next: EventFilter) {
    if (next === filter) return;
    setEvents(null);
    setError(null);
    setFilter(next);
  }

  async function showMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const next = await eventsApi.list(filter, page + 1);
      setEvents((old) => [...(old ?? []), ...next.events.filter((e) => !(old ?? []).some((o) => o.id === e.id))]);
      setPage(page + 1);
      setHasMore(next.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("events.couldntLoadMoreEvents"));
    } finally {
      setLoadingMore(false);
    }
  }

  // A new event goes to the top of "Mine" and, as it is probably the soonest, shows in the others after a look.
  function planned(event: CommunityEvent) {
    setPlanning(false);
    if (filter === "going") return choose("mine");
    setEvents((old) => [...(old ?? []), event].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  }

  const allTabs = tabs();
  const tab = allTabs.find((x) => x.filter === filter)!;
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{t("nav.events")}</h1>
          <p className="text-sm text-white/60">{t("events.meetUpsShowsAnd")}</p>
        </div>
        {!planning && (
          <button type="button" onClick={() => setPlanning(true)} className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
            {t("events.planAnEvent")}
          </button>
        )}
      </div>

      {planning && <EventForm onSaved={planned} onCancel={() => setPlanning(false)} />}

      <div role="group" aria-label={t("events.whichEvents")} className="flex gap-2">
        {allTabs.map((x) => (
          <button
            key={x.filter}
            type="button"
            onClick={() => choose(x.filter)}
            aria-pressed={filter === x.filter}
            className={`rounded-full border px-3 py-1 text-xs ${filter === x.filter ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70 hover:bg-white/10"}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {events === null && !error && <p className="text-sm text-white/60">{t("common.loading")}</p>}
      {events?.length === 0 && <p className="text-sm text-white/60">{tab.empty}</p>}
      <div className="space-y-3">
        {events?.map((event) => (
          <EventCard key={event.id} event={event} onChange={(changed) => setEvents((old) => (old ?? []).map((e) => (e.id === changed.id ? changed : e)))} />
        ))}
      </div>
      {hasMore && (
        <button type="button" onClick={showMore} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? t("common.loading") : t("events.showMoreEvents")}
        </button>
      )}

      <p className="text-xs text-white/60">
        {tRich("events.planLive", {
          live: (c) => (
            <Link to="/live" className="text-violet-300 hover:underline">
              {c}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
