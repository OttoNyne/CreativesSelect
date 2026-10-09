import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { exploreApi, type ExploreKind, type TrendingTag } from "../api/explore.api";
import { ChallengeTile } from "../components/challenge/ChallengeTile";
import { PostCard } from "../components/post/PostCard";
import { useAuth } from "../context/AuthContext";
import { useRobots } from "../lib/useRobots";
import type { ChallengeEntry, Post } from "../types";
import { t } from "../i18n";

// the same rule as the server's: one word of letters, numbers or underscores (at least one letter), 2 to 30 long
const TAG = /^(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]{2,30}$/u;
export const cleanTag = (raw: string | null): string | null => {
  const tag = (raw ?? "").trim().replace(/^#/, "").toLocaleLowerCase();
  return TAG.test(tag) ? tag : null;
};

/** Public posts and pieces, or those about one #hashtag, and the topics trending this week. Open to people who aren't signed in. */
export function ExplorePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tag = cleanTag(params.get("tag"));
  const kind: ExploreKind = params.get("type") === "pieces" ? "pieces" : "posts";
  const [draft, setDraft] = useState(tag ?? "");
  const [badTag, setBadTag] = useState(false);
  const [trending, setTrending] = useState<TrendingTag[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [pieces, setPieces] = useState<ChallengeEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // every page of public posts is shown to anyone, so search engines are asked to stay out (a profile is only listed if its owner opted in)
  useRobots(false);

  useEffect(() => setDraft(tag ?? ""), [tag]);

  useEffect(() => {
    let live = true;
    exploreApi
      .trending()
      .then((r) => live && setTrending(r.tags))
      .catch(() => live && setTrending([]));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setPosts(null);
    setPieces(null);
    setError(null);
    exploreApi
      .list({ type: kind, tag })
      .then((r) => {
        if (!live) return;
        setPosts(r.posts ?? null);
        setPieces(r.pieces ?? null);
        setHasMore(r.hasMore);
        setNext(r.next);
      })
      .catch((err) => live && setError(err instanceof ApiError ? err.message : t("explore.loadFailed")));
    return () => {
      live = false;
    };
  }, [kind, tag]);

  const change = useCallback(
    (nextTag: string | null, nextKind: ExploreKind) => {
      const q = new URLSearchParams();
      if (nextTag) q.set("tag", nextTag);
      if (nextKind === "pieces") q.set("type", "pieces");
      setParams(q);
    },
    [setParams]
  );

  function search(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return change(null, kind);
    const found = cleanTag(draft);
    setBadTag(!found);
    if (found) change(found, kind);
  }

  async function more() {
    setLoadingMore(true);
    try {
      const r = await exploreApi.list({ type: kind, tag, before: next });
      if (r.posts) setPosts((old) => [...(old ?? []), ...r.posts!.filter((p) => !(old ?? []).some((o) => o.id === p.id))]);
      if (r.pieces) setPieces((old) => [...(old ?? []), ...r.pieces!.filter((p) => !(old ?? []).some((o) => o.id === p.id))]);
      setHasMore(r.hasMore);
      setNext(r.next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("explore.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  const items = kind === "posts" ? posts : pieces;
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t("explore.title")}</h1>
        <p className="text-sm text-white/70">{t("explore.intro")}</p>
        <Link to="/challenge" className="text-sm text-violet-300 hover:underline">
          {t("explore.challenge")}
        </Link>
      </header>

      <form onSubmit={search} className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("explore.tagLabel")}</span>
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setBadTag(false);
            }}
            placeholder={t("explore.tagPlaceholder")}
            dir="auto"
            maxLength={31}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
        </label>
        <button type="submit" className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500">
          {t("explore.show")}
        </button>
      </form>
      {badTag && (
        <p role="alert" className="text-xs text-red-400">
          {t("explore.badTag")}
        </p>
      )}

      <section aria-label={t("explore.trending")} className="space-y-2">
        <h2 className="text-sm font-medium text-white">{t("explore.trending")}</h2>
        {trending === null && <p className="text-xs text-white/60">{t("explore.loading")}</p>}
        {trending?.length === 0 && <p className="text-xs text-white/60">{t("explore.noTrending")}</p>}
        {trending && trending.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {trending.map((x) => (
              <li key={x.tag}>
                <Link to={`/explore?tag=${encodeURIComponent(x.tag)}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10">
                  <bdi>#{x.tag}</bdi>
                  <span className="text-white/60">{t("explore.people", { n: x.people })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={t("explore.kind")} className="flex gap-2">
          {(["posts", "pieces"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => change(tag, k)}
              aria-pressed={kind === k}
              className={`rounded-full border px-3 py-1 text-xs ${kind === k ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70 hover:bg-white/10"}`}
            >
              {k === "posts" ? t("explore.posts") : t("explore.pieces")}
            </button>
          ))}
        </div>
        {tag && (
          <p className="flex items-center gap-2 text-sm text-white">
            <bdi>{t("explore.about", { tag })}</bdi>
            <button type="button" onClick={() => change(null, kind)} className="text-xs text-violet-300 hover:underline">
              {t("explore.clear")}
            </button>
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {items === null && !error && <p className="text-sm text-white/60">{t("explore.loading")}</p>}
      {items?.length === 0 && <p className="text-sm text-white/60">{tag ? t("explore.emptyTag", { tag }) : t("explore.empty")}</p>}
      {kind === "posts" && posts && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
      {kind === "pieces" && pieces && pieces.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pieces.map((entry) => (
            <ChallengeTile key={entry.id} entry={entry} canReact={Boolean(user)} />
          ))}
        </ul>
      )}
      {hasMore && items && items.length > 0 && (
        <button type="button" onClick={more} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? t("explore.loading") : t("explore.more")}
        </button>
      )}
    </div>
  );
}
