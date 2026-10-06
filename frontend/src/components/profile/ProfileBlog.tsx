import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { blogApi } from "../../api/blog.api";
import { useAuth } from "../../context/AuthContext";
import type { BlogSummary } from "../../types";
import { formatDay } from "../../lib/when";

/** A profile's blog: its newest entries, ten at a time. Only signed-in people can read entries; an owner can write a new one. */
export function ProfileBlog({ username, isOwner }: { username: string; isOwner: boolean }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<BlogSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    setLoaded(false);
    blogApi
      .byUser(username)
      .then(({ entries, hasMore }) => {
        if (cancelled) return;
        setEntries(entries);
        setHasMore(hasMore);
        setPage(1);
      })
      // e.g. a profile that isn't visible: show nothing rather than an unhandled rejection
      .catch(() => !cancelled && setEntries([]))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [username, signedIn]);

  async function showMore() {
    setLoadingMore(true);
    setError(false);
    try {
      const next = await blogApi.byUser(username, page + 1);
      setEntries((old) => [...old, ...next.entries.filter((e) => !old.some((o) => o.id === e.id))]);
      setPage(page + 1);
      setHasMore(next.hasMore);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!signedIn || !loaded || (!entries.length && !isOwner)) return null;

  return (
    <section id="blog" aria-label="Blog" className="profile-card scroll-mt-20 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="profile-heading text-sm font-semibold uppercase tracking-wide text-white/60">Blog</h2>
        {isOwner && (
          <Link to="/blog/new" className="rounded-md border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10">
            Write an entry
          </Link>
        )}
      </div>
      {!entries.length && <p className="mt-3 text-sm text-white/60">Nothing written yet. Share what you&apos;re thinking about, working on or learning.</p>}
      <ul className="mt-3 space-y-3">
        {entries.map((e) => (
          <li key={e.id}>
            <Link to={`/blog/${e.id}`} className="block rounded-lg border border-white/10 p-3 hover:bg-white/[0.04]">
              <span className="block font-medium text-white">{e.title}</span>
              <span className="block text-xs text-white/60">{formatDay(e.createdAt)}</span>
              <span className="mt-1 block text-sm text-white/70">{e.excerpt}</span>
              {e.commentCount ? <span className="mt-1 block text-xs text-white/60">{e.commentCount} {e.commentCount === 1 ? "comment" : "comments"}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-400">Couldn&apos;t load more entries.</p>}
      {hasMore && (
        <button type="button" onClick={showMore} disabled={loadingMore} className="mt-3 w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? "Loading…" : "Show more entries"}
        </button>
      )}
    </section>
  );
}
