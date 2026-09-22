import { useEffect, useState } from "react";
import { postsApi } from "../api/posts.api";
import { PostComposer } from "../components/post/PostComposer";
import { PostCard } from "../components/post/PostCard";
import { ApiError } from "../api/client";
import type { Post } from "../types";

export function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    postsApi
      .feed()
      .then(({ posts }) => {
        setPosts(posts);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load your feed.");
        setStatus("error");
      });
  }, []);

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await postsApi.remove(id);
      setPosts((p) => p.filter((post) => post.id !== id));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't delete that post.");
    }
  }

  if (status === "error") {
    return <div className="p-8 text-center text-red-400">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}
      <PostComposer onPosted={(post) => setPosts((p) => [post, ...p])} />

      {status === "loading" && <div className="text-center text-white/40">Loading feed…</div>}
      {status === "ready" && posts.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50">
          No posts yet — add some friends or post something of your own.
        </div>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onDeleted={handleDelete} />
      ))}
    </div>
  );
}
