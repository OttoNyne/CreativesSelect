import { useEffect, useRef, useState } from "react";
import { tracksApi } from "../../api/tracks.api";
import { uploadFile } from "../../api/media.api";
import { assetUrl, ApiError } from "../../api/client";
import type { Track } from "../../types";

const MAX_TRACKS = 5;

export function MusicPlayer({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        title: file.name.replace(/\.[^/.]+$/, ""),
        sourceType: "upload",
        url,
      });
      setTracks((t) => [...t, track]);
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

      <div className="mt-3 space-y-3">
        {loading && <p className="text-xs text-white/40">Loading…</p>}
        {!loading && tracks.length === 0 && <p className="text-xs text-white/40">No tracks yet.</p>}
        {tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-white/5 bg-black/20 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">{track.title}</span>
              {isOwner && (
                <button onClick={() => handleRemove(track.id)} className="text-xs text-white/30 hover:text-red-400">
                  ✕
                </button>
              )}
            </div>
            {track.sourceType === "youtube" ? (
              <iframe
                src={`https://www.youtube.com/embed/${track.url}`}
                title={track.title}
                className="h-20 w-full rounded"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            ) : (
              <audio controls src={assetUrl(track.url)} className="w-full" />
            )}
          </div>
        ))}
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "📎 Upload a song"}
              </button>
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
