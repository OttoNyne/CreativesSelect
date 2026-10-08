import { useEffect, useRef, useState } from "react";
import { mediaApi, uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { checkVideoFile, MAX_VIDEO_MB, MAX_VIDEO_SECONDS } from "../../lib/video";
import { GenerateImageButton } from "../ai/GenerateImageButton";
import { ImageSearchPicker } from "../ai/ImageSearchPicker";
import { PortfolioTile, MAX_CAPTION_LENGTH } from "./PortfolioTile";
import { PieceComments } from "./PieceComments";
import { AlbumBar, ALL } from "./AlbumBar";
import { albumsApi } from "../../api/albums.api";
import type { Album, MediaItem, ReactionKey } from "../../types";


export function PortfolioGrid({ username, isOwner, focusPiece = null, focusComment = null }: { username: string; isOwner: boolean; /** A piece, and one of its comments, to open and scroll to (from a notification). */ focusPiece?: string | null; focusComment?: string | null }) {
  const { user: viewer } = useAuth();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selected, setSelected] = useState<string>(ALL);
  const [prompt, setPrompt] = useState("");
  // A caption written before adding the next piece (an upload, a video link or a photo from the search).
  const [nextCaption, setNextCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkStart, setLinkStart] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(focusPiece);
  const focusedFor = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mediaApi
      .byUser(username)
      .then(({ media }) => setItems(media))
      // e.g. a private profile: show the empty state instead of an unhandled rejection
      .catch(() => setItems([]));
  }, [username]);

  // Bring the piece a notification was about into view.
  useEffect(() => {
    if (!focusPiece || focusedFor.current === focusPiece || !items.some((i) => i.id === focusPiece)) return;
    focusedFor.current = focusPiece;
    setCommentsOpenFor(focusPiece);
    document.getElementById(`piece-${focusPiece}`)?.scrollIntoView?.({ block: "center" });
  }, [focusPiece, items]);

  useEffect(() => {
    albumsApi
      .byUser(username)
      .then(({ albums }) => setAlbums(albums))
      .catch(() => setAlbums([])); // e.g. a private profile
    setSelected(ALL);
  }, [username]);

  const counts: Record<string, number> = {};
  for (const item of items) if (item.albumId) counts[item.albumId] = (counts[item.albumId] ?? 0) + 1;
  const shown = selected === ALL ? items : items.filter((item) => item.albumId === selected);

  const problemOf = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
  async function createAlbum(title: string): Promise<string | null> {
    try {
      const { album } = await albumsApi.create(title);
      setAlbums((a) => [...a, album]);
      setSelected(album.id);
      return null;
    } catch (err) {
      return problemOf(err, "Couldn't make that album.");
    }
  }
  async function renameAlbum(id: string, title: string): Promise<string | null> {
    try {
      const { album } = await albumsApi.rename(id, title);
      setAlbums((a) => a.map((x) => (x.id === id ? album : x)));
      return null;
    } catch (err) {
      return problemOf(err, "Couldn't rename that album.");
    }
  }
  async function deleteAlbum(id: string) {
    setError(null);
    try {
      await albumsApi.remove(id);
      setAlbums((a) => a.filter((x) => x.id !== id));
      setItems((list) => list.map((item) => (item.albumId === id ? { ...item, albumId: null } : item)));
      setSelected(ALL);
    } catch (err) {
      setError(problemOf(err, "Couldn't delete that album."));
    }
  }
  async function moveItem(id: string, albumId: string | null) {
    setError(null);
    try {
      await mediaApi.setAlbum(id, albumId);
      setItems((list) => list.map((item) => (item.id === id ? { ...item, albumId } : item)));
    } catch (err) {
      setError(problemOf(err, "Couldn't move that piece."));
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setError(null);
    if (file.type.startsWith("video/")) {
      const problem = await checkVideoFile(file);
      if (problem) return setError(problem);
    }
    setUploading(true);
    try {
      const { mediaItem } = await uploadFile(file, "portfolio", nextCaption.trim() || undefined);
      if (mediaItem) setItems((i) => [mediaItem, ...i]);
      setNextCaption("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim() || linkBusy) return;
    setLinkBusy(true);
    setError(null);
    try {
      const { mediaItem } = await mediaApi.create({
        type: "video",
        url: linkUrl.trim(),
        startSeconds: linkStart.trim() ? Number(linkStart) : undefined,
        caption: nextCaption.trim() || undefined,
      });
      setItems((i) => [mediaItem, ...i]);
      setNextCaption("");
      setLinkUrl("");
      setLinkStart("");
      setShowLink(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that video link.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleAiGenerated(url: string) {
    setError(null);
    try {
      // The prompt becomes the caption, but captions are limited to 200 characters while
      // prompts can be far longer — an over-long caption used to make the save fail and
      // lose the generated picture.
      const caption = nextCaption.trim() || prompt.trim().slice(0, MAX_CAPTION_LENGTH) || undefined;
      const { mediaItem } = await mediaApi.create({ url, type: "image", caption, isAiImage: true });
      setItems((i) => [mediaItem, ...i]);
      setNextCaption("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that image.");
    }
  }

  async function handleSearchSelected(url: string) {
    setError(null);
    try {
      const { mediaItem } = await mediaApi.create({ url, type: "image", caption: nextCaption.trim() || undefined });
      setItems((i) => [mediaItem, ...i]);
      setNextCaption("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that image.");
    }
  }

  /** Saves a caption (or takes it off); gives back the reason it couldn't be saved, for the box to show. */
  async function handleCaption(id: string, caption: string | null): Promise<string | null> {
    try {
      const { item } = await mediaApi.setCaption(id, caption);
      setItems((list) => list.map((x) => (x.id === id ? { ...x, caption: item.caption } : x)));
      return null;
    } catch (err) {
      return problemOf(err, "Couldn't save that caption.");
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm("Remove this from your portfolio? This can't be undone.")) return;
    setError(null);
    try {
      await mediaApi.remove(id);
      setItems((i) => i.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that item.");
    }
  }

  async function handleReact(id: string, emoji: ReactionKey | null) {
    setError(null);
    try {
      const result = await mediaApi.react(id, emoji);
      setItems((list) => list.map((item) => (item.id === id ? { ...item, reactions: result.reactions } : item)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your reaction.");
    }
  }

  // The count on a piece follows what happens in its comments (the list there may hold only some of them).
  function changeCommentCount(id: string, update: (count: number) => number) {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, commentCount: update(item.commentCount ?? 0) } : item)));
  }

  const field =
    "min-w-0 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none";

  return (
    <div id="portfolio" className="profile-card scroll-mt-20 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="profile-heading text-sm font-semibold uppercase tracking-wide text-white/60">Portfolio</h2>
        {isOwner && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowLink((s) => !s)}
              className="text-xs text-[var(--profile-accent-text)] hover:underline"
            >
              + Video link
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-[var(--profile-accent-text)] hover:underline disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "+ Upload"}
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {isOwner && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-white/60">
            Pictures up to 10 MB. Videos up to {MAX_VIDEO_SECONDS} seconds and {MAX_VIDEO_MB} MB — upload one, or paste a YouTube or
            direct video link (it plays as a {MAX_VIDEO_SECONDS}-second clip).
          </p>
          {showLink && (
            <form onSubmit={handleAddLink} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=… or https://…/clip.mp4"
                aria-label="Video link"
                className={`${field} flex-1`}
              />
              <input
                value={linkStart}
                onChange={(e) => setLinkStart(e.target.value)}
                placeholder="Start at (sec)"
                aria-label="Start time in seconds"
                inputMode="numeric"
                className={`${field} sm:w-28`}
              />
              <button
                type="submit"
                disabled={!linkUrl.trim() || linkBusy}
                className="rounded-md bg-[var(--profile-accent-fill)] px-3 py-1 text-xs font-medium text-[var(--profile-on-accent)] disabled:opacity-50"
              >
                {linkBusy ? "Adding…" : "Add video"}
              </button>
            </form>
          )}
          <input
            value={nextCaption}
            onChange={(e) => setNextCaption(e.target.value)}
            maxLength={MAX_CAPTION_LENGTH}
            placeholder="Caption for the next piece you add (optional)"
            aria-label="Caption for the next piece"
            className={`${field} w-full`}
          />
          <div className="flex items-center gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe an image to generate…"
              className={`${field} flex-1`}
            />
            <GenerateImageButton kind="post" getPrompt={() => prompt} onGenerated={handleAiGenerated} label="Generate" />
          </div>
          <ImageSearchPicker label="🔍 Search photos" onSelect={handleSearchSelected} />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <AlbumBar albums={albums} counts={counts} total={items.length} selected={selected} onSelect={setSelected} isOwner={isOwner} onCreate={createAlbum} onRename={renameAlbum} onDelete={deleteAlbum} />

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.length === 0 && <p className="col-span-3 text-xs text-white/60">No portfolio pieces yet.</p>}
        {items.length > 0 && shown.length === 0 && <p className="col-span-3 text-xs text-white/60">Nothing in this album yet.</p>}
        {shown.map((item) => (
          <PortfolioTile
            key={item.id}
            item={item}
            isOwner={isOwner}
            canReact={Boolean(viewer)}
            onRemove={handleRemove}
            onReact={handleReact}
            albums={albums}
            onMove={moveItem}
            onCaption={handleCaption}
            commentsOpen={commentsOpenFor === item.id}
            onToggleComments={(id) => setCommentsOpenFor((open) => (open === id ? null : id))}
            comments={
              commentsOpenFor === item.id && (
                <PieceComments mediaId={item.id} isOwner={isOwner} onCountChange={(update) => changeCommentCount(item.id, update)} highlightId={item.id === focusPiece ? focusComment : null} />
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
