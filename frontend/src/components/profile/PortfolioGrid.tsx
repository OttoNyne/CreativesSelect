import { useEffect, useRef, useState } from "react";
import { mediaApi, uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { checkVideoFile, MAX_VIDEO_SECONDS } from "../../lib/video";
import { GenerateImageButton } from "../ai/GenerateImageButton";
import { ImageSearchPicker } from "../ai/ImageSearchPicker";
import { PortfolioTile } from "./PortfolioTile";
import type { MediaItem } from "../../types";

const MAX_CAPTION_LENGTH = 200;

export function PortfolioGrid({ username, isOwner }: { username: string; isOwner: boolean }) {
  const { user: viewer } = useAuth();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkStart, setLinkStart] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mediaApi
      .byUser(username)
      .then(({ media }) => setItems(media))
      // e.g. a private profile: show the empty state instead of an unhandled rejection
      .catch(() => setItems([]));
  }, [username]);

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
      const { mediaItem } = await uploadFile(file, "portfolio");
      if (mediaItem) setItems((i) => [mediaItem, ...i]);
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
      });
      setItems((i) => [mediaItem, ...i]);
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
      const caption = prompt.trim().slice(0, MAX_CAPTION_LENGTH) || undefined;
      const { mediaItem } = await mediaApi.create({ url, type: "image", caption, isAiImage: true });
      setItems((i) => [mediaItem, ...i]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that image.");
    }
  }

  async function handleSearchSelected(url: string) {
    setError(null);
    try {
      const { mediaItem } = await mediaApi.create({ url, type: "image" });
      setItems((i) => [mediaItem, ...i]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that image.");
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

  async function handleReact(id: string, value: 1 | -1 | 0) {
    setError(null);
    try {
      const result = await mediaApi.react(id, value);
      setItems((list) => list.map((item) => (item.id === id ? { ...item, ...result } : item)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your reaction.");
    }
  }

  const field =
    "min-w-0 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-[var(--profile-accent)] focus:outline-none";

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Portfolio</h2>
        {isOwner && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowLink((s) => !s)}
              className="text-xs text-[var(--profile-accent)] hover:underline"
            >
              + Video link
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-[var(--profile-accent)] hover:underline disabled:opacity-50"
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
          <p className="text-[11px] text-white/30">
            Pictures up to 10 MB. Videos up to {MAX_VIDEO_SECONDS} seconds and 30 MB — upload one, or paste a YouTube or
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
                className="rounded-md bg-[var(--profile-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {linkBusy ? "Adding…" : "Add video"}
              </button>
            </form>
          )}
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

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.length === 0 && <p className="col-span-3 text-xs text-white/40">No portfolio pieces yet.</p>}
        {items.map((item) => (
          <PortfolioTile
            key={item.id}
            item={item}
            isOwner={isOwner}
            canReact={Boolean(viewer)}
            onRemove={handleRemove}
            onReact={handleReact}
          />
        ))}
      </div>
    </div>
  );
}
