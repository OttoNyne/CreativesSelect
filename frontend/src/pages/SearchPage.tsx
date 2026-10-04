import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { profilesApi } from "../api/profiles.api";
import { ApiError } from "../api/client";
import type { User } from "../types";
import { Avatar } from "../components/common/Avatar";
import { isValidTag, normalizeTag } from "../lib/tags";

function PersonCard({ user, onTag }: { user: User; onTag?: (tag: string) => void }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <Link to={`/u/${user.username}`} className="flex items-center gap-3 hover:underline">
        <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={40} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-white">{user.displayName}</span>
          <span className="block truncate text-xs text-white/60">@{user.username}</span>
        </span>
      </Link>
      {user.mood && <p className="mt-1.5 truncate text-xs text-white/70">{user.mood}</p>}
      {user.bio && <p className="mt-1 line-clamp-2 text-sm text-white/70">{user.bio}</p>}
      {onTag && user.tags && user.tags.length > 0 && (
        <ul aria-label={`${user.displayName}'s tags`} className="mt-2 flex flex-wrap gap-1.5">
          {user.tags.map((t) => (
            <li key={t}>
              <button type="button" onClick={() => onTag(t)} aria-label={`Browse everyone tagged ${t}`} className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10">
                #{t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Find creatives: by name, or by browsing the tags people use and the newest to join. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const rawTag = params.get("tag") ?? "";
  const tag = isValidTag(normalizeTag(rawTag)) ? normalizeTag(rawTag) : "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [popular, setPopular] = useState<{ tag: string; count: number }[]>([]);
  const [people, setPeople] = useState<User[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [browseError, setBrowseError] = useState(false);

  useEffect(() => {
    profilesApi
      .tags()
      .then(({ tags }) => setPopular(tags))
      .catch(() => {});
  }, []);

  // The newest creatives, or those with the chosen tag; starts over whenever the tag changes.
  useEffect(() => {
    let cancelled = false;
    setPeople(null);
    setBrowseError(false);
    profilesApi
      .discover({ tag: tag || undefined })
      .then(({ users, hasMore }) => {
        if (cancelled) return;
        setPeople(users);
        setPage(1);
        setHasMore(hasMore);
      })
      .catch(() => {
        if (!cancelled) {
          setPeople([]);
          setBrowseError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  async function showMore() {
    setLoadingMore(true);
    try {
      const { users, hasMore } = await profilesApi.discover({ tag: tag || undefined, page: page + 1 });
      setPeople((old) => [...(old ?? []), ...users.filter((u) => !(old ?? []).some((o) => o.id === u.id))]);
      setPage(page + 1);
      setHasMore(hasMore);
    } catch {
      setBrowseError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setSearched(false);
      return;
    }
    setError(null);
    try {
      const { users } = await profilesApi.search(query.trim());
      setResults(users);
      setSearched(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't search right now.");
    }
  }

  const chooseTag = (t: string) => {
    setSearched(false);
    setParams(t ? { tag: t } : {});
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creatives…"
          aria-label="Search creatives"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        <button type="submit" className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          Search
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {searched ? (
        <section aria-label="Search results" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Results</h2>
            <button type="button" onClick={() => setSearched(false)} className="text-xs text-violet-300 hover:underline">
              Back to browsing
            </button>
          </div>
          {results.length === 0 && <p className="text-sm text-white/60">No creatives found.</p>}
          <ul className="space-y-2">
            {results.map((u) => (
              <PersonCard key={u.id} user={u} />
            ))}
          </ul>
        </section>
      ) : (
        <>
          {popular.length > 0 && (
            <section aria-label="Browse by tag">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Browse by tag</h2>
              <ul className="flex flex-wrap gap-1.5">
                {popular.map((t) => (
                  <li key={t.tag}>
                    <button
                      type="button"
                      onClick={() => chooseTag(tag === t.tag ? "" : t.tag)}
                      aria-pressed={tag === t.tag}
                      className={`rounded-full border px-2.5 py-1 text-xs ${tag === t.tag ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/80 hover:bg-white/10"}`}
                    >
                      #{t.tag} <span className="text-white/60">{t.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label={tag ? `Creatives tagged ${tag}` : "New creatives"} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{tag ? `Tagged #${tag}` : "New creatives"}</h2>
              {tag && (
                <button type="button" onClick={() => chooseTag("")} className="text-xs text-violet-300 hover:underline">
                  Show everyone
                </button>
              )}
            </div>
            {people === null && <p className="text-sm text-white/60">Loading…</p>}
            {browseError && <p className="text-sm text-red-400">Couldn&apos;t load creatives right now.</p>}
            {people?.length === 0 && !browseError && (
              <p className="text-sm text-white/60">{tag ? `No one has tagged themselves #${tag} yet.` : "No one to show yet — invite your friends."}</p>
            )}
            <ul className="space-y-2">
              {people?.map((u) => (
                <PersonCard key={u.id} user={u} onTag={chooseTag} />
              ))}
            </ul>
            {hasMore && (
              <button type="button" onClick={showMore} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
