import type { ReactNode } from "react";
import { assetUrl } from "../../api/client";
import { clipWindow, directVideoSrc, playableVideoUrl, videoPosterUrl, youtubeEmbedUrl } from "../../lib/video";
import type { Album, MediaItem } from "../../types";

type Reaction = 1 | -1 | 0;

// One portfolio piece: the picture/video/audio, an always-visible remove
// button for its owner (hover-only controls don't exist on phones),
// like/dislike buttons and a button for its comments, which open beside it.
export function PortfolioTile({
  item,
  isOwner,
  canReact,
  onRemove,
  onReact,
  albums = [],
  onMove,
  commentsOpen = false,
  onToggleComments,
  comments,
}: {
  item: MediaItem;
  isOwner: boolean;
  canReact: boolean;
  onRemove: (id: string) => void;
  onReact: (id: string, value: Reaction) => void;
  /** Their albums, and how to move this piece into one (owner only). */
  albums?: Album[];
  onMove?: (id: string, albumId: string | null) => void;
  /** Whether the comments are showing, how to show or hide them, and what to show. */
  commentsOpen?: boolean;
  onToggleComments?: (id: string) => void;
  comments?: ReactNode;
}) {
  const isVideoish = item.type === "video" || item.type === "embed";
  const embed = item.type === "embed" ? youtubeEmbedUrl(item.url, item.startSeconds ?? 0) : null;
  const isUploadedVideo = item.type === "video" && item.durationSeconds != null;

  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    // A linked video can't be measured, so it only plays a 30-second window.
    const video = e.currentTarget;
    const { end } = clipWindow(item.startSeconds ?? 0);
    if (video.currentTime >= end) {
      video.pause();
      video.currentTime = end;
    }
  }

  return (
    <div id={`piece-${item.id}`} className={`scroll-mt-20 overflow-hidden rounded-lg border border-white/10 ${commentsOpen ? "col-span-full sm:flex" : isVideoish ? "col-span-2" : ""}`}>
      <div className={commentsOpen ? "sm:w-72 sm:shrink-0" : "min-w-0"}>
      <div className="relative">
        {item.type === "audio" ? (
          <audio controls src={assetUrl(item.url)} className="w-full" />
        ) : item.type === "embed" ? (
          embed ? (
            <iframe
              src={embed}
              title={item.caption ?? "Video"}
              loading="lazy"
              allow="fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full"
            />
          ) : (
            <p className="p-3 text-xs text-white/60">This video link can't be shown.</p>
          )
        ) : item.type === "video" ? (
          <video
            controls
            playsInline
            preload="metadata"
            poster={videoPosterUrl(item.url)}
            src={isUploadedVideo ? playableVideoUrl(item.url) : directVideoSrc(item.url, item.startSeconds ?? 0)}
            onTimeUpdate={isUploadedVideo ? undefined : onTimeUpdate}
            className="aspect-video w-full bg-black object-contain"
          />
        ) : (
          <img src={assetUrl(item.url)} alt={item.caption ?? ""} className="aspect-square w-full object-cover" />
        )}

        {item.isAiImage && (
          <span className="absolute left-1 top-1 rounded-full bg-fuchsia-500/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
            AI
          </span>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove from portfolio"
            title="Remove from portfolio"
            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-xs text-white hover:bg-red-600"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 bg-black/20 px-2 py-1">
        <button
          type="button"
          onClick={() => onReact(item.id, item.myReaction === 1 ? 0 : 1)}
          disabled={!canReact}
          aria-pressed={item.myReaction === 1}
          aria-label="Like"
          title={canReact ? "Like" : "Log in to react"}
          className={`rounded-md px-2 py-0.5 text-xs disabled:opacity-60 ${
            item.myReaction === 1 ? "bg-emerald-500/25 text-emerald-300" : "text-white/60 hover:bg-white/10"
          }`}
        >
          👍 {item.likes}
        </button>
        <button
          type="button"
          onClick={() => onReact(item.id, item.myReaction === -1 ? 0 : -1)}
          disabled={!canReact}
          aria-pressed={item.myReaction === -1}
          aria-label="Dislike"
          title={canReact ? "Dislike" : "Log in to react"}
          className={`rounded-md px-2 py-0.5 text-xs disabled:opacity-60 ${
            item.myReaction === -1 ? "bg-red-500/25 text-red-300" : "text-white/60 hover:bg-white/10"
          }`}
        >
          👎 {item.dislikes}
        </button>
        {onToggleComments && (
          <button
            type="button"
            onClick={() => onToggleComments(item.id)}
            aria-expanded={commentsOpen}
            aria-label={`Comments (${item.commentCount ?? 0})`}
            title={commentsOpen ? "Hide comments" : "Show comments"}
            className={`rounded-md px-2 py-0.5 text-xs ${commentsOpen ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10"}`}
          >
            💬 {item.commentCount ?? 0}
          </button>
        )}
        {item.caption && <span className="ml-auto truncate text-[11px] text-white/60">{item.caption}</span>}
      </div>
      {isOwner && onMove && albums.length > 0 && (
        <div className="bg-black/20 px-2 pb-1.5">
          <select
            value={item.albumId ?? ""}
            onChange={(e) => onMove(item.id, e.target.value || null)}
            aria-label={`Album for ${item.caption || "this piece"}`}
            className="w-full rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white focus:border-[var(--profile-accent)] focus:outline-none"
          >
            <option value="">No album</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>
      )}
      </div>
      {commentsOpen && comments && <div className="min-w-0 flex-1 border-t border-white/10 px-3 pb-3 sm:border-l sm:border-t-0">{comments}</div>}
    </div>
  );
}
