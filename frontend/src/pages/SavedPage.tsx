import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { savesApi, type SaveKind } from "../api/saves.api";
import { ChallengeTile } from "../components/challenge/ChallengeTile";
import { PostCard } from "../components/post/PostCard";
import type { ChallengeEntry, Post } from "../types";
import { t } from "../i18n";

/** The posts and pieces you saved, most recently saved first. Only you can see it. */
export function SavedPage() {
  const [kind, setKind] = useState<SaveKind>("posts");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [pieces, setPieces] = useState<ChallengeEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPosts(null);
    setPieces(null);
    setError(null);
    savesApi
      .list(kind)
      .then((r) => {
        if (!live) return;
        setPosts(r.posts ?? null);
        setPieces(r.pieces ?? null);
        setHasMore(r.hasMore);
        setNext(r.next);
      })
      .catch((err) => live && setError(err instanceof ApiError ? err.message : t("saves.loadFailed")));
    return () => {
      live = false;
    };
  }, [kind]);

  async function more() {
    setLoadingMore(true);
    try {
      const r = await savesApi.list(kind, next);
      if (r.posts) setPosts((old) => [...(old ?? []), ...r.posts!.filter((p) => !(old ?? []).some((o) => o.id === p.id))]);
      if (r.pieces) setPieces((old) => [...(old ?? []), ...r.pieces!.filter((p) => !(old ?? []).some((o) => o.id === p.id))]);
      setHasMore(r.hasMore);
      setNext(r.next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saves.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  const items = kind === "posts" ? posts : pieces;
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t("saves.title")}</h1>
        <p className="text-sm text-white/70">{t("saves.intro")}</p>
      </header>
      <div role="group" aria-label={t("saves.kind")} className="flex gap-2">
        {(["posts", "pieces"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-full border px-3 py-1 text-xs ${kind === k ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70 hover:bg-white/10"}`}
          >
            {k === "posts" ? t("saves.posts") : t("saves.pieces")}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {items === null && !error && <p className="text-sm text-white/60">{t("saves.loading")}</p>}
      {items?.length === 0 && <p className="text-sm text-white/60">{t("saves.empty")}</p>}
      {kind === "posts" && posts && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onSavedChange={(saved) => !saved && setPosts((old) => (old ?? []).filter((p) => p.id !== post.id))} />
          ))}
        </div>
      )}
      {kind === "pieces" && pieces && pieces.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pieces.map((entry) => (
            <ChallengeTile key={entry.id} entry={entry} canReact onSavedChange={(saved) => !saved && setPieces((old) => (old ?? []).filter((p) => p.id !== entry.id))} />
          ))}
        </ul>
      )}
      {hasMore && items && items.length > 0 && (
        <button type="button" onClick={more} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? t("saves.loading") : t("saves.more")}
        </button>
      )}
    </div>
  );
}
