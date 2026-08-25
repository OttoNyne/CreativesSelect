import { useEffect, useState } from "react";
import { postsApi } from "../api/posts.api";
import { PostComposer } from "../components/post/PostComposer";
import { PostCard } from "../components/post/PostCard";
import type { Post } from "../types";

export function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    postsApi.feed().then(({ posts }) => {
      setPosts(posts);
      setLoading(false);
    });
  }, []);

  async function handleDelete(id: string) {
    await postsApi.remove(id);
    setPosts((p) => p.filter((post) => post.id !== id));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <PostComposer onPosted={(post) => setPosts((p) => [post, ...p])} />

      {loading && <div className="text-center text-white/40">Loading feed…</div>}
      {!loading && posts.length === 0 && (
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
