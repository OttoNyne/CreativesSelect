import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { challengesApi, GALLERY_PAGE, type GallerySort } from "../api/challenges.api";
import { mediaApi } from "../api/media.api";
import { ChallengeTile } from "../components/challenge/ChallengeTile";
import { useAuth } from "../context/AuthContext";
import { formatCalendarDay } from "../lib/when";
import type { ChallengeEntry, ChallengeWeek, MediaItem } from "../types";
import { language, t } from "../i18n";

type Current = { week: ChallengeWeek; previous: ChallengeWeek; entryCount: number; mine: { id: string; item: MediaItem } | null };

/** The last day the week is open (it closes at the start of the next Monday, UTC). */
const lastDay = (week: ChallengeWeek) => new Date(Date.parse(week.endsAt) - 86_400_000).toISOString().slice(0, 10);

/** Which piece to put forward: the signed-in person's own pieces, labelled by number and caption. */
function EntryForm({ onEntered }: { onEntered: (entry: { id: string; item: MediaItem }) => void }) {
  const { user } = useAuth();
  const [pieces, setPieces] = useState<MediaItem[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let current = true;
    mediaApi
      .byUser(user.username)
      .then(({ media }) => current && setPieces(media.filter((m) => m.type !== "audio")))
      .catch((err) => current && setProblem(err instanceof ApiError ? err.message : t("challenge.loadFailed")));
    return () => {
      current = false;
    };
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      onEntered((await challengesApi.enter(chosen)).entry);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("challenge.loadFailed"));
      setBusy(false);
    }
  }

  if (user?.isPrivate) return <p className="text-sm text-amber-300">{t("challenge.privateNote")}</p>;
  if (pieces && pieces.length === 0) {
    return (
      <p className="text-sm text-white/70">
        {t("challenge.noPieces")}{" "}
        <Link to={`/u/${user?.username}`} className="text-violet-300 hover:underline">
          {t("challenge.toProfile")}
        </Link>
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-sm text-white/80">
        {t("challenge.pickPiece")}
        <select
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          disabled={!pieces}
          className="mt-1 block w-full rounded-md border border-white/20 bg-black/40 px-2 py-2 text-sm text-white"
        >
          <option value="" />
          {pieces?.map((piece, i) => (
            <option key={piece.id} value={piece.id}>
              {t("challenge.pieceOption", { n: i + 1, caption: piece.caption || t("challenge.noCaption") })}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!chosen || busy} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
        {t("challenge.enter")}
      </button>
      {problem && (
        <p role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      )}
    </form>
  );
}

export function ChallengePage() {
  const { user } = useAuth();
  const lang = language();
  const [current, setCurrent] = useState<Current | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[] | null>(null);
  const [lastWeekTop, setLastWeekTop] = useState<ChallengeEntry[] | null>(null);
  const [sort, setSort] = useState<GallerySort>("new");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGallery = useCallback(
    async (week: string, order: GallerySort) => {
      const result = await challengesApi.entries(week, { lang, sort: order });
      setEntries(result.entries);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage(1);
    },
    [lang]
  );

  // this week, and last week's most loved
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const now = await challengesApi.current(lang);
        if (!live) return;
        setCurrent(now);
        const [, last] = await Promise.all([loadGallery(now.week.key, "new"), challengesApi.entries(now.previous.key, { lang, sort: "top", limit: 3 })]);
        if (live) setLastWeekTop(last.entries);
      } catch (err) {
        if (live) setError(err instanceof ApiError ? err.message : t("challenge.loadFailed"));
      }
    })();
    return () => {
      live = false;
    };
    // the viewer's identity changes what "mine" is
  }, [lang, loadGallery, user?.id]);

  async function choose(next: GallerySort) {
    if (next === sort || !current) return;
    setSort(next);
    setEntries(null);
    try {
      await loadGallery(current.week.key, next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("challenge.loadFailed"));
    }
  }

  async function showMore() {
    if (!current) return;
    setBusy(true);
    try {
      const next = await challengesApi.entries(current.week.key, { lang, sort, page: page + 1 });
      setEntries((old) => [...(old ?? []), ...next.entries.filter((e) => !(old ?? []).some((o) => o.id === e.id))]);
      setPage(page + 1);
      setHasMore(next.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("challenge.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function entered(entry: { id: string; item: MediaItem }) {
    if (!current) return;
    setError(null);
    setNotice(t("challenge.entered"));
    setCurrent({ ...current, mine: entry, entryCount: current.entryCount + 1 });
    await loadGallery(current.week.key, sort).catch(() => {});
  }

  async function withdraw() {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await challengesApi.withdraw();
      setNotice(t("challenge.withdrawn"));
      setCurrent({ ...current, mine: null, entryCount: Math.max(0, current.entryCount - 1) });
      await loadGallery(current.week.key, sort).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("challenge.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t("challenge.title")}</h1>
        <p className="text-sm text-white/70">{t("challenge.intro")}</p>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {!current && !error && <p className="text-sm text-white/60">{t("common.loading")}</p>}

      {current && (
        <>
          <section aria-label={t("challenge.thisWeek")} className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-violet-200">{t("challenge.thisWeek")}</p>
            <p dir="auto" className="mt-1 text-2xl font-bold text-white">
              {current.week.prompt}
            </p>
            <p className="mt-1 text-xs text-white/70">
              {t("challenge.endsOn", { date: formatCalendarDay(lastDay(current.week)) })} · {t("challenge.entryCount", { n: current.entryCount })}
            </p>
          </section>

          <section aria-label={t("challenge.yourEntry")} className="space-y-2">
            {!user ? (
              <p className="text-sm text-white/70">
                {t("challenge.joinToEnter")}{" "}
                <Link to="/register" className="font-medium text-violet-300 hover:underline">
                  {t("common.signUp")}
                </Link>{" "}
                <Link to="/login" className="text-violet-300 hover:underline">
                  {t("common.logIn")}
                </Link>
              </p>
            ) : current.mine ? (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-white">{t("challenge.yourEntry")}</h2>
                <ul className="grid max-w-xs grid-cols-1 gap-3">
                  <ChallengeTile
                    entry={{ id: current.mine.id, item: current.mine.item, owner: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null, csVerified: Boolean(user.csVerified) }, createdAt: "" }}
                    canReact={false}
                  />
                </ul>
                <button type="button" onClick={withdraw} disabled={busy} className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50">
                  {t("challenge.withdraw")}
                </button>
              </div>
            ) : (
              <EntryForm onEntered={entered} />
            )}
            {notice && (
              <p role="status" className="text-sm text-emerald-400">
                {notice}
              </p>
            )}
          </section>

          <section aria-label={t("challenge.lastWeekTop")} className="space-y-2">
            <h2 className="text-sm font-medium text-white">{t("challenge.lastWeek", { prompt: current.previous.prompt })}</h2>
            {lastWeekTop && lastWeekTop.length === 0 && <p className="text-sm text-white/60">{t("challenge.noneLastWeek")}</p>}
            {lastWeekTop && lastWeekTop.length > 0 && (
              <>
                <p className="text-xs text-white/60">{t("challenge.lastWeekTop")}</p>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {lastWeekTop.map((entry) => (
                    <ChallengeTile key={entry.id} entry={entry} canReact={false} />
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-label={t("challenge.gallery")} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-white">{t("challenge.gallery")}</h2>
              <div role="group" aria-label={t("challenge.sortBy")} className="flex gap-2">
                {(["new", "top"] as const).map((order) => (
                  <button
                    key={order}
                    type="button"
                    onClick={() => choose(order)}
                    aria-pressed={sort === order}
                    className={`rounded-full border px-3 py-1 text-xs ${sort === order ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70 hover:bg-white/10"}`}
                  >
                    {order === "new" ? t("challenge.sortNew") : t("challenge.sortTop")}
                  </button>
                ))}
              </div>
            </div>
            {entries === null && <p className="text-sm text-white/60">{t("common.loading")}</p>}
            {entries && total === 0 && <p className="text-sm text-white/60">{t("challenge.empty")}</p>}
            {entries && entries.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {entries.map((entry) => (
                  <ChallengeTile key={entry.id} entry={entry} canReact={Boolean(user)} />
                ))}
              </ul>
            )}
            {hasMore && entries && entries.length >= GALLERY_PAGE && (
              <button type="button" onClick={showMore} disabled={busy} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
                {busy ? t("common.loading") : t("challenge.more")}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
