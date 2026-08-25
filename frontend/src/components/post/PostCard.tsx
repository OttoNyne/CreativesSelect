import { useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../types";
import { Avatar } from "../common/Avatar";
import { assetUrl } from "../../api/client";
import { PostCommentList } from "./PostCommentList";
import { useAuth } from "../../context/AuthContext";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PostCard({ post, onDeleted }: { post: Post; onDeleted?: (id: string) => void }) {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const isOwner = user?.id === post.authorId;

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <Link to={`/u/${post.author.username}`}>
          <Avatar username={post.author.username} displayName={post.author.displayName} avatarUrl={post.author.avatarUrl} size={40} />
        </Link>
        <div>
          <Link to={`/u/${post.author.username}`} className="font-medium text-white hover:underline">
            {post.author.displayName}
          </Link>
          <div className="text-xs text-white/40">
            @{post.author.username} · {timeAgo(post.createdAt)}
          </div>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-white/90">{post.content}</p>

      {post.imageUrl && (
        <img src={assetUrl(post.imageUrl)} alt="" className="mt-3 max-h-96 w-full rounded-lg object-cover" />
      )}

      {(post.isAiText || post.isAiImage) && (
        <div className="mt-2 flex gap-1.5">
          {post.isAiText && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              ✨ AI-assisted text
            </span>
          )}
          {post.isAiImage && (
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-medium text-fuchsia-300">
              🖼️ AI-generated image
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-2 text-xs text-white/50">
        <button onClick={() => setShowComments((s) => !s)} className="hover:text-white">
          💬 {commentCount} comment{commentCount === 1 ? "" : "s"}
        </button>
        {onDeleted && isOwner && (
          <button onClick={() => onDeleted(post.id)} className="ml-auto hover:text-red-400">
            Delete
          </button>
        )}
      </div>

      {showComments && <PostCommentList postId={post.id} onCountChange={setCommentCount} />}
    </article>
  );
}
