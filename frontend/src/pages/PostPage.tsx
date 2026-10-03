import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { postsApi } from "../api/posts.api";
import { ApiError } from "../api/client";
import { PostCard } from "../components/post/PostCard";
import type { Post } from "../types";

// One post on its own page: where a notification about a comment on it lands. The comments are open, and the comment the
// notification was about is scrolled to and highlighted.
export function PostPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const highlightId = params.get("comment");
  const [post, setPost] = useState<Post | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setPost(null);
    postsApi
      .get(id)
      .then(({ post }) => {
        if (cancelled) return;
        setPost(post);
        setState("ready");
      })
      .catch((err) => {
        if (!cancelled) setState(err instanceof ApiError && err.status === 404 ? "missing" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
      <Link to="/" className="text-sm text-violet-400 hover:underline">
        ← Back to your feed
      </Link>
      {state === "loading" && <p className="p-8 text-center text-white/60">Loading…</p>}
      {state === "missing" && (
        <p role="alert" className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/70">
          This post isn&apos;t available. It may have been deleted, or it&apos;s from someone you can&apos;t see.
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-red-400">
          Couldn&apos;t load this post. Please try again.
        </p>
      )}
      {state === "ready" && post && <PostCard post={post} autoOpenComments highlightCommentId={highlightId} />}
    </div>
  );
}
