import { assetUrl } from "../../api/client";
import { clipWindow, directVideoSrc, playableVideoUrl, videoPosterUrl, youtubeEmbedUrl } from "../../lib/video";
import type { MediaItem } from "../../types";

type Reaction = 1 | -1 | 0;

// One portfolio piece: the picture/video/audio, an always-visible remove
// button for its owner (hover-only controls don't exist on phones), and
// like/dislike buttons.
export function PortfolioTile({
  item,
  isOwner,
  canReact,
  onRemove,
  onReact,
}: {
  item: MediaItem;
  isOwner: boolean;
  canReact: boolean;
  onRemove: (id: string) => void;
  onReact: (id: string, value: Reaction) => void;
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
    <div className={`overflow-hidden rounded-lg border border-white/10 ${isVideoish ? "col-span-2" : ""}`}>
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
            <p className="p-3 text-xs text-white/40">This video link can't be shown.</p>
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
        {item.caption && <span className="ml-auto truncate text-[11px] text-white/40">{item.caption}</span>}
      </div>
    </div>
  );
}
