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
  const { current, play } = usePlayback();

  useEffect(() => {
    tracksApi.byUser(username).then(({ tracks }) => {
      setTracks(tracks);
      setLoading(false);
    });
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

  async function handleRemove(id: string) {
    await tracksApi.remove(id);
    setTracks((t) => t.filter((track) => track.id !== id));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Music</h2>
        <span className="text-xs text-white/30">
          {tracks.length}/{MAX_TRACKS}
        </span>
      </div>
      {tracks.length > 1 && (
        <p className="mt-1 text-[10px] text-white/30">
          Plays straight through the queue until you pause — keeps going as you browse elsewhere in the app.
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {loading && <p className="text-xs text-white/40">Loading…</p>}
        {!loading && tracks.length === 0 && <p className="text-xs text-white/40">No tracks yet.</p>}
        {tracks.map((track) => {
          const isPlaying = current?.id === track.id;
          return (
            <div
              key={track.id}
              className={`flex items-center gap-2 rounded-lg border p-2 ${
                isPlaying ? "border-[var(--profile-accent)] bg-white/5" : "border-white/5 bg-black/20"
              }`}
            >
              <button
                onClick={() => play(track, tracks)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                  isPlaying ? "bg-[var(--profile-accent)] text-white" : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
                title={isPlaying ? "Playing" : "Play"}
              >
                {isPlaying ? "♪" : "▶"}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/80">{track.title}</p>
                <p className="text-[10px] text-white/30">{track.sourceType === "youtube" ? "YouTube" : "Uploaded"}</p>
              </div>
              {isOwner && (
                <button onClick={() => handleRemove(track.id)} className="shrink-0 text-xs text-white/30 hover:text-red-400">
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isOwner && (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          {atLimit ? (
            <p className="text-xs text-white/30">Remove a track to add another.</p>
          ) : (
            <>
              <form onSubmit={handleAddYoutube} className="flex flex-col gap-1.5 sm:flex-row">
                <input
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value)}
                  placeholder="Track title"
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-[var(--profile-accent)] focus:outline-none sm:w-32"
                />
                <input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste a YouTube link…"
                  className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-[var(--profile-accent)] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-[var(--profile-accent)] px-3 py-1 text-xs font-medium text-white"
                >
                  Add
                </button>
              </form>
              <div className="flex gap-1.5">
                <input
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="Caption (optional)"
                  className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-[var(--profile-accent)] focus:outline-none"
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
