import { useEffect, useState } from "react";
import { postsApi } from "../api/posts.api";
import { PostComposer } from "../components/post/PostComposer";
import { BulletinsStrip } from "../components/bulletins/BulletinsStrip";
import { WelcomeChecklist } from "../components/onboarding/WelcomeChecklist";
import { PostCard } from "../components/post/PostCard";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ThemedPage, hasChosenBackground } from "../components/layout/ThemedPage";
import type { Post } from "../types";
import { t } from "../i18n";

export function FeedPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    postsApi
      .feed()
      .then(({ posts, hasMore }) => {
        setPosts(posts);
        setHasMore(Boolean(hasMore));
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("feed.loadFailed"));
        setStatus("error");
      });
  }, []);

  // Older posts, twenty more at a time.
  async function showOlder() {
    const oldest = posts[posts.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    setActionError(null);
    try {
      const next = await postsApi.feed(oldest.id);
      setPosts((p) => [...p, ...next.posts.filter((n) => !p.some((o) => o.id === n.id))]);
      setHasMore(Boolean(next.hasMore));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("feed.olderFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await postsApi.remove(id);
      setPosts((p) => p.filter((post) => post.id !== id));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("feed.deleteFailed"));
    }
  }

  if (status === "error") {
    return <div className="p-8 text-center text-red-400">{error}</div>;
  }

  const content = (
    <>
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}
      <WelcomeChecklist />
      <BulletinsStrip />
      <PostComposer onPosted={(post) => setPosts((p) => [post, ...p])} />

      {status === "loading" && <div className="text-center text-white/60">{t("feed.loading")}</div>}
      {status === "ready" && posts.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
          {t("feed.empty")}
        </div>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onDeleted={handleDelete} />
      ))}
      {hasMore && (
        <button type="button" onClick={showOlder} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? t("common.loading") : t("feed.showOlder")}
        </button>
      )}
    </>
  );

  // On the background they chose for their profile (a colour or a wallpaper); anyone who hasn't chosen one sees the usual page.
  if (user && hasChosenBackground(user)) {
    return (
      <ThemedPage look={user} backgroundOnly contentClassName="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {content}
      </ThemedPage>
    );
  }
  return <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">{content}</div>;
}
