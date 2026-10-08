import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { profilesApi } from "../api/profiles.api";
import { SEARCH_TYPES, isSearchType } from "../api/search.api";
import type { SearchConnection, SearchType } from "../api/search.api";
import type { User } from "../types";
import { PersonCard } from "../components/search/PersonCard";
import { SearchResults } from "../components/search/SearchResults";
import { isValidTag, normalizeTag } from "../lib/tags";
import { t } from "../i18n";

const CONNECTION_LABELS: Record<SearchConnection, string> = {
  get any() {
    return t("misc.anyone");
  },
  get friends() {
    return t("misc.myFriends");
  },
  get mutual() {
    return t("misc.friendsOfFriends");
  },
};
const isConnection = (value: string | null): value is SearchConnection => value === "any" || value === "friends" || value === "mutual";

/** Search people, blog entries, groups, group topics and Help wanted, or browse the tags people use and the newest to join. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const rawTag = params.get("tag") ?? "";
  const tag = isValidTag(normalizeTag(rawTag)) ? normalizeTag(rawTag) : "";

  // what is being searched for lives in the address, so a search can be shared, reloaded and gone back to
  const q = (params.get("q") ?? "").trim();
  const rawType = params.get("type");
  const type: SearchType = isSearchType(rawType) ? rawType : "people";
  const rawConnection = params.get("connection");
  const connection: SearchConnection = isConnection(rawConnection) ? rawConnection : "any";
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]); // going back or forward changes the search in the address

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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const text = query.trim();
    const next = new URLSearchParams(params);
    if (!text) next.delete("q");
    else next.set("q", text);
    setParams(next);
  }

  /** Change one part of the search (or the browsing) and keep the rest. */
  function change(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value && !(key === "connection" && value === "any") && !(key === "type" && value === "people")) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }

  const chooseTag = (t: string) => change({ tag: t });

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("misc.searchPeopleWritingGroups")}
          aria-label={t("nav.search")}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        <button type="submit" className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          {t("nav.search")}
        </button>
      </form>

      {q ? (
        <section aria-label={t("misc.searchResults")} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div role="tablist" aria-label={t("misc.whatToSearch")} className="flex flex-wrap gap-1.5">
              {SEARCH_TYPES.map((x) => (
                <button
                  key={x.type}
                  type="button"
                  role="tab"
                  aria-selected={type === x.type}
                  onClick={() => change({ type: x.type, tag: x.type === "people" ? tag : "", connection: x.type === "people" ? connection : "" })}
                  className={`rounded-full border px-3 py-1 text-sm ${type === x.type ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/80 hover:bg-white/10"}`}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setQuery(""); setParams(tag ? { tag } : {}); }} className="shrink-0 text-xs text-violet-300 hover:underline">
              {t("misc.backToBrowsing")}
            </button>
          </div>
          {type === "people" && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
              <label className="flex items-center gap-2">
                {t("misc.show")}
                <select value={connection} onChange={(e) => change({ connection: e.target.value })} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-white focus:border-violet-500 focus:outline-none">
                  {(Object.keys(CONNECTION_LABELS) as SearchConnection[]).map((c) => (
                    <option key={c} value={c}>
                      {CONNECTION_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              {tag && (
                <button type="button" onClick={() => chooseTag("")} aria-label={t("misc.stopFilteringBy", { tag })} className="rounded-full border border-violet-400 bg-violet-500/20 px-2.5 py-1 text-xs text-white">
                  #{tag} ✕
                </button>
              )}
            </div>
          )}
          <SearchResults q={q} type={type} tag={type === "people" ? tag : ""} connection={type === "people" ? connection : "any"} onTag={chooseTag} />
        </section>
      ) : (
        <>
          {popular.length > 0 && (
            <section aria-label={t("misc.browseByTag")}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">{t("misc.browseByTag")}</h2>
              <ul className="flex flex-wrap gap-1.5">
                {popular.map((p) => (
                  <li key={p.tag}>
                    <button
                      type="button"
                      onClick={() => chooseTag(tag === p.tag ? "" : p.tag)}
                      aria-pressed={tag === p.tag}
                      className={`rounded-full border px-2.5 py-1 text-xs ${tag === p.tag ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/80 hover:bg-white/10"}`}
                    >
                      #{p.tag} <span className="text-white/60">{p.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label={tag ? t("misc.creativesTagged", { tag }) : t("misc.newCreatives")} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{tag ? t("misc.taggedHeading", { tag }) : t("misc.newCreatives")}</h2>
              {tag && (
                <button type="button" onClick={() => chooseTag("")} className="text-xs text-violet-300 hover:underline">
                  {t("misc.showEveryone")}
                </button>
              )}
            </div>
            {people === null && <p className="text-sm text-white/60">{t("common.loading")}</p>}
            {browseError && <p className="text-sm text-red-400">{t("misc.couldntLoadCreativesRight")}</p>}
            {people?.length === 0 && !browseError && (
              <p className="text-sm text-white/60">{tag ? t("misc.noOneTagged", { tag }) : t("misc.noOneToShow")}</p>
            )}
            <ul className="space-y-2">
              {people?.map((u) => (
                <PersonCard key={u.id} user={u} onTag={chooseTag} />
              ))}
            </ul>
            {hasMore && (
              <button type="button" onClick={showMore} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
                {loadingMore ? t("common.loading") : t("events.showMore")}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
