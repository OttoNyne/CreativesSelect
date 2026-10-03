import { useEffect, useRef, useState } from "react";
import { tracksApi } from "../../api/tracks.api";
import { uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import { usePlayback } from "../../context/PlaybackContext";
import type { Track } from "../../types";

const MAX_TRACKS = 5;

export function MusicPlayer({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropOn, setDropOn] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const { current, play, reorderQueue } = usePlayback();

  useEffect(() => {
    tracksApi
      .byUser(username)
      .then(({ tracks }) => setTracks(tracks))
      // e.g. a private profile: show the empty state rather than an unhandled rejection
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [username]);

  const atLimit = tracks.length >= MAX_TRACKS;

  async function handleAddYoutube(e: React.FormEvent) {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;
    setError(null);
    try {
      const { track } = await tracksApi.add({
        title: youtubeTitle.trim() || "Untitled track",
        sourceType: "youtube",
        url: youtubeUrl.trim(),
      });
      setTracks((t) => [...t, track]);
      setYoutubeUrl("");
      setYoutubeTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that track");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await uploadFile(file, "tracks");
      const { track } = await tracksApi.add({
        title: uploadCaption.trim() || file.name.replace(/\.[^/.]+$/, ""),
        sourceType: "upload",
        url,
      });
      setTracks((t) => [...t, track]);
      setUploadCaption("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Moves a track to a new place in the playlist (by up/down buttons or by dragging), shows it at once, and saves the order.
  async function moveTrack(from: number, to: number) {
    if (saving || from === to || to < 0 || to >= tracks.length) return;
    const before = tracks;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setTracks(next);
    setAnnouncement(`Moved ${moved.title} to position ${to + 1} of ${next.length}.`);
    setError(null);
    setSaving(true);
    try {
      const { tracks: saved } = await tracksApi.reorder(next.map((t) => t.id));
      setTracks(saved);
      reorderQueue(saved);
    } catch (err) {
      setTracks(before);
      setAnnouncement("");
      setError(err instanceof ApiError ? err.message : "Couldn't save the new order.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await tracksApi.remove(id);
      setTracks((t) => t.filter((track) => track.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that track.");
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Music</h2>
        <span className="text-xs text-white/60">
          {tracks.length}/{MAX_TRACKS}
        </span>
      </div>
      {tracks.length > 1 && (
        <p className="mt-1 text-[10px] text-white/60">
          Plays straight through the queue until you pause — keeps going as you browse elsewhere in the app.
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {loading && <p className="text-xs text-white/60">Loading…</p>}
        {!loading && tracks.length === 0 && <p className="text-xs text-white/60">No tracks yet.</p>}
        {tracks.map((track, index) => {
          const isPlaying = current?.id === track.id;
          const canArrange = isOwner && tracks.length > 1;
          return (
            <div
              key={track.id}
              data-testid="track-row"
              draggable={canArrange && !saving}
              onDragStart={(e) => {
                setDragging(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", track.id); // Firefox won't start a drag without some data
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setDropOn(index);
              }}
              onDragLeave={() => setDropOn((d) => (d === index ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) void moveTrack(dragging, index);
                setDragging(null);
                setDropOn(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropOn(null);
              }}
              className={`flex items-center gap-2 rounded-lg border p-2 ${
                isPlaying ? "border-[var(--profile-accent)] bg-white/5" : "border-white/5 bg-black/20"
              } ${dragging === index ? "opacity-50" : ""} ${dropOn === index && dragging !== index ? "ring-2 ring-[var(--profile-accent)]" : ""}`}
            >
              {canArrange && (
                <span aria-hidden="true" title="Drag to rearrange" className="shrink-0 cursor-grab select-none text-sm text-white/60">
                  ⠿
                </span>
              )}
              <button
                onClick={() => play(track, tracks)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                  isPlaying ? "bg-[var(--profile-accent-fill)] text-[var(--profile-on-accent)]" : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
                title={isPlaying ? "Playing" : "Play"}
              >
                {isPlaying ? "♪" : "▶"}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/80">{track.title}</p>
                <p className="text-[10px] text-white/60">{track.sourceType === "youtube" ? "YouTube" : "Uploaded"}</p>
              </div>
              {canArrange && (
                <div className="flex shrink-0 flex-col">
                  <button
                    onClick={() => moveTrack(index, index - 1)}
                    disabled={saving || index === 0}
                    aria-label={`Move ${track.title} up`}
                    className="flex h-6 w-9 items-center justify-center text-[11px] text-white/70 hover:text-white disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveTrack(index, index + 1)}
                    disabled={saving || index === tracks.length - 1}
                    aria-label={`Move ${track.title} down`}
                    className="flex h-6 w-9 items-center justify-center text-[11px] text-white/70 hover:text-white disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              )}
              {isOwner && (
                <button onClick={() => handleRemove(track.id)} aria-label={`Remove ${track.title}`} className="shrink-0 text-xs text-white/60 hover:text-red-400">
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {isOwner && (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          {atLimit ? (
            <p className="text-xs text-white/60">Remove a track to add another.</p>
          ) : (
            <>
              <form onSubmit={handleAddYoutube} className="flex flex-col gap-1.5 sm:flex-row">
                <input
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value)}
                  placeholder="Track title"
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none sm:w-32"
                />
                <input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste a YouTube link…"
                  className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-[var(--profile-accent-fill)] px-3 py-1 text-xs font-medium text-[var(--profile-on-accent)]"
                >
                  Add
                </button>
              </form>
              <div className="flex gap-1.5">
                <input
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="Caption (optional)"
                  className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="shrink-0 rounded-md border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "📎 Upload a song"}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
