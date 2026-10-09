import { useState, type ReactNode } from "react";
import { assetUrl } from "../../api/client";
import { clipWindow, directVideoSrc, playableVideoUrl, videoPosterUrl, youtubeEmbedUrl } from "../../lib/video";
import type { Album, MediaCredit, MediaItem, ReactionKey } from "../../types";
import { PieceCredits } from "./PieceCredits";
import { ReactionBar } from "../common/ReactionBar";
import { SaveButton } from "../common/SaveButton";
import { PinButton } from "../common/PinButton";
import { ProcessTimeline } from "./ProcessTimeline";
import { ReportButton } from "../common/ReportButton";
import { AskFeedback } from "../critique/AskFeedback";
import { t } from "../../i18n";


export const MAX_CAPTION_LENGTH = 200;

/** The owner's way to write, change or take off a piece's caption, in place. Says why it can't be saved. */
function CaptionEditor({ caption, onSave, onCancel }: { caption: string; onSave: (caption: string | null) => Promise<string | null>; onCancel: () => void }) {
  const [draft, setDraft] = useState(caption);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const failed = await onSave(draft.trim() || null);
    if (failed) {
      setProblem(failed);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={MAX_CAPTION_LENGTH}
        placeholder={t("media.saySomethingAboutThis")}
        aria-label={t("media.caption")}
        autoFocus
        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none"
      />
      <div className="flex items-center gap-2 text-[11px]">
        <button type="submit" disabled={busy || draft.trim() === caption} className="rounded-md bg-[var(--profile-accent-fill)] px-2 py-0.5 font-medium text-[var(--profile-on-accent)] disabled:opacity-50">
          {busy ? t("reset.saving") : t("common.save")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-white/70 hover:underline disabled:opacity-50">
          {t("common.cancel")}
        </button>
        <span className="ms-auto text-white/60">
          {draft.length}/{MAX_CAPTION_LENGTH}
        </span>
      </div>
      {problem && (
        <p role="alert" className="text-[11px] text-red-400">
          {problem}
        </p>
      )}
    </form>
  );
}

// One portfolio piece: the picture/video/audio, an always-visible remove
// button for its owner (hover-only controls don't exist on phones),
// emoji reactions and a button for its comments, which open beside it.
export function PortfolioTile({
  item,
  isOwner,
  canReact,
  onRemove,
  onReact,
  albums = [],
  onMove,
  onCaption,
  onCredits,
  onFeaturedChange,
  commentsOpen = false,
  onToggleComments,
  comments,
}: {
  item: MediaItem;
  isOwner: boolean;
  canReact: boolean;
  onRemove: (id: string) => void;
  onReact: (id: string, emoji: ReactionKey | null) => Promise<void>;
  /** Their albums, and how to move this piece into one (owner only). */
  albums?: Album[];
  onMove?: (id: string, albumId: string | null) => void;
  /** How the owner changes the piece's caption: resolves to the reason it couldn't be saved, or null. */
  onCaption?: (id: string, caption: string | null) => Promise<string | null>;
  /** Told when the people credited on the piece change (credited, accepted, removed). */
  onCredits?: (id: string, credits: MediaCredit[]) => void;
  /** Told when the owner features this piece or stops (the owner sees a Feature button). */
  onFeaturedChange?: (id: string, featured: boolean) => void;
  /** Whether the comments are showing, how to show or hide them, and what to show. */
  commentsOpen?: boolean;
  onToggleComments?: (id: string) => void;
  comments?: ReactNode;
}) {
  const isVideoish = item.type === "video" || item.type === "embed";
  const embed = item.type === "embed" ? youtubeEmbedUrl(item.url, item.startSeconds ?? 0) : null;
  const isUploadedVideo = item.type === "video" && item.durationSeconds != null;
  const [editingCaption, setEditingCaption] = useState(false);
  // how it was made: the steps open under the piece, which then takes the whole row
  const [processOpen, setProcessOpen] = useState(false);
  const [processCount, setProcessCount] = useState(item.processCount ?? 0);

  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    // A linked video can't be measured, so it only plays a one-minute window.
    const video = e.currentTarget;
    const { end } = clipWindow(item.startSeconds ?? 0);
    if (video.currentTime >= end) {
      video.pause();
      video.currentTime = end;
    }
  }

  return (
    <div id={`piece-${item.id}`} className={`scroll-mt-20 overflow-hidden rounded-lg border border-white/10 ${commentsOpen ? "col-span-full sm:flex" : processOpen ? "col-span-full" : isVideoish ? "col-span-2" : ""}`}>
      <div className={commentsOpen ? "sm:w-72 sm:shrink-0" : "min-w-0"}>
      <div className="relative">
        {item.type === "audio" ? (
          <audio controls src={assetUrl(item.url)} className="w-full" />
        ) : item.type === "embed" ? (
          embed ? (
            <iframe
              src={embed}
              title={item.caption ?? t("media.video")}
              loading="lazy"
              allow="fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full"
            />
          ) : (
            <p className="p-3 text-xs text-white/60">{t("media.thisVideoLinkCant")}</p>
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
          <span className="absolute start-1 top-1 rounded-full bg-fuchsia-500/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
            {t("media.ai")}
          </span>
        )}
        {item.featured && (
          <span className="absolute bottom-1 start-1 rounded-full bg-violet-700 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <span aria-hidden="true">📌</span> {t("pinned.featured")}
          </span>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={t("media.removeFromPortfolio")}
            title={t("media.removeFromPortfolio")}
            className="absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-xs text-white hover:bg-red-600"
          >
            ✕
          </button>
        )}
      </div>

      {(item.caption || (isOwner && onCaption)) && (
        <div className="bg-black/20 px-2 pt-1.5 text-xs text-white/80">
          {editingCaption && onCaption ? (
            <CaptionEditor
              caption={item.caption ?? ""}
              onSave={async (caption) => {
                const failed = await onCaption(item.id, caption);
                if (!failed) setEditingCaption(false);
                return failed;
              }}
              onCancel={() => setEditingCaption(false)}
            />
          ) : (
            <p className="flex items-start gap-1.5">
              {item.caption && <span dir="auto" className="min-w-0 flex-1 break-words">{item.caption}</span>}
              {isOwner && onCaption && (
                <button type="button" onClick={() => setEditingCaption(true)} aria-label={item.caption ? t("media.editCaption") : t("media.addACaption")} className="shrink-0 text-[11px] text-[var(--profile-accent-text)] hover:underline">
                  {item.caption ? t("media.edit") : t("media.addACaption2")}
                </button>
              )}
            </p>
          )}
        </div>
      )}

      <PieceCredits item={item} isOwner={isOwner} onChange={(credits) => onCredits?.(item.id, credits)} />

      <div className="flex flex-wrap items-center gap-1 bg-black/20 px-2 py-1">
        <ReactionBar summary={item.reactions} canReact={canReact} onReact={(key) => onReact(item.id, key)} label={t("media.reactionsToThisPiece")} />
        {canReact && <SaveButton kind="pieces" id={item.id} saved={item.saved === true} className="text-[11px] text-white/60" />}
        {canReact && !isOwner && <ReportButton targetType="piece" targetId={item.id} label={t("report.piece")} className="text-[11px] text-white/60" />}
        {(isOwner || canReact) && <AskFeedback item={item} isOwner={isOwner} signedIn={canReact} />}
        {isOwner && onFeaturedChange && <PinButton kind="piece" id={item.id} on={item.featured === true} onChange={(now) => onFeaturedChange(item.id, now)} className="text-[11px] text-white/60" />}
        {(processCount > 0 || isOwner) && (
          <button
            type="button"
            onClick={() => setProcessOpen((open) => !open)}
            aria-expanded={processOpen}
            className={`rounded-md px-2 py-0.5 text-[11px] ${processOpen ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10"}`}
          >
            {processCount > 0 ? t("process.show", { n: processCount }) : t("process.add")}
          </button>
        )}
        {onToggleComments && (
          <button
            type="button"
            onClick={() => onToggleComments(item.id)}
            aria-expanded={commentsOpen}
            aria-label={t("media.commentsAria", { n: item.commentCount ?? 0 })}
            title={commentsOpen ? t("media.hideComments") : t("media.showComments")}
            className={`rounded-md px-2 py-0.5 text-xs ${commentsOpen ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10"}`}
          >
            💬 {item.commentCount ?? 0}
          </button>
        )}
      </div>
      {isOwner && onMove && albums.length > 0 && (
        <div className="bg-black/20 px-2 pb-1.5">
          <select
            value={item.albumId ?? ""}
            onChange={(e) => onMove(item.id, e.target.value || null)}
            aria-label={t("media.albumFor", { name: item.caption || t("media.thisPiece") })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white focus:border-[var(--profile-accent)] focus:outline-none"
          >
            <option value="">{t("media.noAlbum")}</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {processOpen && <ProcessTimeline piece={item} isOwner={isOwner} onCountChange={setProcessCount} />}
      </div>
      {commentsOpen && comments && <div className="min-w-0 flex-1 border-t border-white/10 px-3 pb-3 sm:border-s sm:border-t-0">{comments}</div>}
    </div>
  );
}
