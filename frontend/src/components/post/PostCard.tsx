import { useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../types";
import { Avatar } from "../common/Avatar";
import { assetUrl } from "../../api/client";
import { FramedImage } from "../common/FramedImage";
import { PostCommentList } from "./PostCommentList";
import { useAuth } from "../../context/AuthContext";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import { EditBox } from "../common/EditBox";
import { EditedMark } from "../common/EditedMark";

const MAX_POST = 5000;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PostCard({
  post,
  onDeleted,
  autoOpenComments = false,
  highlightCommentId = null,
}: {
  post: Post;
  onDeleted?: (id: string) => void;
  /** Start with the comments showing (used when arriving from a notification). */
  autoOpenComments?: boolean;
  /** A comment to scroll to and highlight. */
  highlightCommentId?: string | null;
}) {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(autoOpenComments);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [content, setContent] = useState(post.content);
  const [editedAt, setEditedAt] = useState(post.editedAt ?? null);
  const [editing, setEditing] = useState(false);
  const isOwner = user?.id === post.authorId;

  async function saveEdit(text: string): Promise<string | null> {
    try {
      const { post: updated } = await postsApi.update(post.id, text);
      setContent(updated.content);
      setEditedAt(updated.editedAt ?? null);
      setEditing(false);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Couldn't save that change.";
    }
  }

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
          <div className="text-xs text-white/60">
            @{post.author.username} · {timeAgo(post.createdAt)}
          </div>
        </div>
      </div>

      {editing ? (
        <EditBox text={content} maxText={MAX_POST} label="Edit post" onSave={({ text }) => saveEdit(text)} onCancel={() => setEditing(false)} />
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-white/90">
          {content} <EditedMark editedAt={editedAt} />
        </p>
      )}

      {post.imageUrl &&
        (post.imageAspect ? (
          // framed by its author
          <FramedImage
            src={assetUrl(post.imageUrl)}
            aspect={post.imageAspect}
            zoom={post.imageZoom ?? 1}
            position={post.imagePosition ?? "50% 50%"}
            className="mt-3 rounded-lg"
          />
        ) : (
          // posted before framing existed: shown as it always was
          <img src={assetUrl(post.imageUrl)} alt="" className="mt-3 max-h-96 w-full rounded-lg object-cover" />
        ))}

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

      <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-2 text-xs text-white/60">
        <button onClick={() => setShowComments((s) => !s)} className="hover:text-white">
          💬 {commentCount} comment{commentCount === 1 ? "" : "s"}
        </button>
        {isOwner && !editing && (
          <button onClick={() => setEditing(true)} className="ml-auto hover:text-white">
            Edit
          </button>
        )}
        {onDeleted && isOwner && (
          <button onClick={() => onDeleted(post.id)} className={isOwner && !editing ? "hover:text-red-400" : "ml-auto hover:text-red-400"}>
            Delete
          </button>
        )}
      </div>

      {showComments && <PostCommentList postId={post.id} onCountChange={setCommentCount} highlightId={highlightCommentId} />}
    </article>
  );
}
