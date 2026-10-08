import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, assetUrl } from "../../api/client";
import { mediaApi } from "../../api/media.api";
import { clipWindow, directVideoSrc, playableVideoUrl, videoPosterUrl, youtubeEmbedUrl } from "../../lib/video";
import { ReactionBar } from "../common/ReactionBar";
import type { ChallengeEntry, MediaItem, ReactionKey } from "../../types";
import { t } from "../../i18n";

/** The piece itself: a picture, a video that plays (a linked one only for its one-minute window), a YouTube embed, or sound. */
function Piece({ item }: { item: MediaItem }) {
  const embed = item.type === "embed" ? youtubeEmbedUrl(item.url, item.startSeconds ?? 0) : null;
  const uploaded = item.type === "video" && item.durationSeconds != null;
  if (item.type === "audio") return <audio controls src={assetUrl(item.url)} className="w-full" />;
  if (item.type === "embed") {
    return embed ? (
      <iframe src={embed} title={item.caption ?? t("media.video")} loading="lazy" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" className="aspect-video w-full" />
    ) : (
      <p className="p-3 text-xs text-white/60">{t("media.thisVideoLinkCant")}</p>
    );
  }
  if (item.type === "video") {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        poster={videoPosterUrl(item.url)}
        src={uploaded ? playableVideoUrl(item.url) : directVideoSrc(item.url, item.startSeconds ?? 0)}
        onTimeUpdate={
          uploaded
            ? undefined
            : (e) => {
                const { end } = clipWindow(item.startSeconds ?? 0);
                if (e.currentTarget.currentTime >= end) {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = end;
                }
              }
        }
        className="aspect-video w-full bg-black object-contain"
      />
    );
  }
  return <img src={assetUrl(item.url)} alt={item.caption ?? ""} className="aspect-square w-full object-cover" />;
}

/** One entry in the gallery: the piece, who made it (linked to their profile), and the reactions on it. */
export function ChallengeTile({ entry, canReact }: { entry: ChallengeEntry; canReact: boolean }) {
  const [reactions, setReactions] = useState(entry.item.reactions);
  const [problem, setProblem] = useState<string | null>(null);

  async function react(emoji: ReactionKey | null) {
    setProblem(null);
    try {
      setReactions((await mediaApi.react(entry.item.id, emoji)).reactions);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("post.reactFailed"));
    }
  }

  return (
    <li className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <Piece item={entry.item} />
      <div className="space-y-1 p-2">
        {entry.item.caption && (
          <p dir="auto" className="break-words text-xs text-white/80">
            {entry.item.caption}
          </p>
        )}
        <Link to={`/u/${entry.owner.username}`} className="block truncate text-xs text-violet-300 hover:underline">
          {t("challenge.by", { name: entry.owner.displayName })} <bdi>(@{entry.owner.username})</bdi>
        </Link>
        <ReactionBar summary={reactions} canReact={canReact} onReact={react} />
        {problem && (
          <p role="alert" className="text-xs text-red-400">
            {problem}
          </p>
        )}
      </div>
    </li>
  );
}
