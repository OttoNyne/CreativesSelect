import { useEffect, useRef, useState } from "react";
import { MAX_TRACKS, MAX_TRACK_ARTIST, MAX_TRACK_TITLE, MAX_UPLOADS, tracksApi } from "../../api/tracks.api";
import { uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import { usePlayback } from "../../context/PlaybackContext";
import type { Track } from "../../types";
import { t } from "../../i18n";

export function MusicPlayer({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editBusy, setEditBusy] = useState(false);
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
  const uploadCount = tracks.filter((t) => t.sourceType === "upload").length;
  const atUploadLimit = uploadCount >= MAX_UPLOADS;
  const profileSong = tracks.find((t) => t.profileSong);

  async function handleAddYoutube(e: React.FormEvent) {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;
    setError(null);
    try {
      const { track } = await tracksApi.add({
        title: youtubeTitle.trim() || t("media.untitledTrack"),
        sourceType: "youtube",
        url: youtubeUrl.trim(),
        ...(artist.trim() ? { artist: artist.trim() } : {}),
      });
      setTracks((t) => [...t, track]);
      setYoutubeUrl("");
      setYoutubeTitle("");
      setArtist("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("media.couldntAddThatTrack"));
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
        ...(artist.trim() ? { artist: artist.trim() } : {}),
      });
      setTracks((t) => [...t, track]);
      setUploadCaption("");
      setArtist("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("media.couldntUploadThatFile"));
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
    setAnnouncement(t("media.trackMoved", { title: moved.title, pos: to + 1, total: next.length }));
    setError(null);
    setSaving(true);
    try {
      const { tracks: saved } = await tracksApi.reorder(next.map((t) => t.id));
      setTracks(saved);
      reorderQueue(saved);
    } catch (err) {
      setTracks(before);
      setAnnouncement("");
      setError(err instanceof ApiError ? err.message : t("media.couldntSaveTheNew"));
    } finally {
      setSaving(false);
    }
  }

  function startEditing(track: Track) {
    setEditing(track.id);
    setEditTitle(track.title);
    setEditArtist(track.artist ?? "");
    setError(null);
  }

  async function saveEdit(e: React.FormEvent, track: Track) {
    e.preventDefault();
    if (editBusy) return;
    if (!editTitle.trim()) return setError(t("media.aTrackNeedsA"));
    setEditBusy(true);
    setError(null);
    try {
      const { track: saved } = await tracksApi.update(track.id, { title: editTitle.trim(), artist: editArtist.trim() });
      setTracks((list) => list.map((t) => (t.id === track.id ? { ...t, title: saved.title, artist: saved.artist } : t)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveChangeFailed"));
    } finally {
      setEditBusy(false);
    }
  }

  // One song stands for the profile; choosing another moves the mark. It never starts by itself.
  async function toggleProfileSong(track: Track) {
    setError(null);
    try {
      const make = !track.profileSong;
      await tracksApi.update(track.id, { profileSong: make });
      setTracks((list) => list.map((t) => (t.id === track.id ? { ...t, profileSong: make } : make ? { ...t, profileSong: false } : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("media.couldntChangeTheProfile"));
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await tracksApi.remove(id);
      setTracks((t) => t.filter((track) => track.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("media.couldntRemoveThatTrack"));
    }
  }

  return (
    <div className="profile-card rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="profile-heading text-sm font-semibold uppercase tracking-wide text-white/60">{t("sections.music")}</h2>
        <span className="text-xs text-white/60">
          {tracks.length}/{MAX_TRACKS}
        </span>
      </div>
      {profileSong && (
        <button
          type="button"
          onClick={() => play(profileSong, tracks)}
          className="mt-2 rounded-full border border-[var(--profile-accent)] px-3 py-1 text-xs font-medium text-[var(--profile-accent-text)] hover:bg-white/10"
        >
          {t("media.playProfileSong", { title: profileSong.title })}
        </button>
      )}
      {tracks.length > 1 && (
        <p className="mt-1 text-[10px] text-white/60">
          {t("media.playsStraightThroughThe")}
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {loading && <p className="text-xs text-white/60">{t("common.loading")}</p>}
        {!loading && tracks.length === 0 && <p className="text-xs text-white/60">{t("media.noTracksYet")}</p>}
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
                <span aria-hidden="true" title={t("profile.dragToRearrange")} className="shrink-0 cursor-grab select-none text-sm text-white/60">
                  ⠿
                </span>
              )}
              <button
                onClick={() => play(track, tracks)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                  isPlaying ? "bg-[var(--profile-accent-fill)] text-[var(--profile-on-accent)]" : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
                title={isPlaying ? t("media.playing") : t("media.play")}
              >
                {isPlaying ? "♪" : "▶"}
              </button>
              {editing === track.id ? (
                <form onSubmit={(e) => saveEdit(e, track)} className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row">
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={MAX_TRACK_TITLE} aria-label={t("media.trackTitle")} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-[var(--profile-accent)] focus:outline-none" />
                  <input value={editArtist} onChange={(e) => setEditArtist(e.target.value)} maxLength={MAX_TRACK_ARTIST} placeholder={t("media.artist")} aria-label={t("media.artist")} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none" />
                  <span className="flex gap-2">
                    <button type="submit" disabled={editBusy} className="rounded-md bg-[var(--profile-accent-fill)] px-2 py-1 text-xs font-medium text-[var(--profile-on-accent)] disabled:opacity-50">
                      {t("common.save")}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} disabled={editBusy} className="text-xs text-white/70 hover:underline">
                      {t("common.cancel")}
                    </button>
                  </span>
                </form>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white/80">{track.title}</p>
                  <p className="text-[10px] text-white/60">
                    {[track.artist, track.sourceType === "youtube" ? "YouTube" : t("media.uploadedLabel"), track.plays ? t("media.playsCount", { n: track.plays }) : null].filter(Boolean).join(" · ")}
                    {track.profileSong && <span className="ms-1.5 rounded-full border border-[var(--profile-accent)] px-1.5 text-[var(--profile-accent-text)]">{t("media.profileSong")}</span>}
                  </p>
                </div>
              )}
              {isOwner && editing !== track.id && (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => toggleProfileSong(track)}
                    aria-pressed={Boolean(track.profileSong)}
                    aria-label={track.profileSong ? t("media.stopProfileSong", { title: track.title }) : t("media.makeProfileSong", { title: track.title })}
                    title={track.profileSong ? t("media.profileSong") : t("media.makeThisTheProfile")}
                    className={`flex h-7 w-7 items-center justify-center text-sm ${track.profileSong ? "text-[var(--profile-accent-text)]" : "text-white/60 hover:text-white"}`}
                  >
                    {track.profileSong ? "★" : "☆"}
                  </button>
                  <button type="button" onClick={() => startEditing(track)} aria-label={`Edit ${track.title}`} className="flex h-7 w-7 items-center justify-center text-xs text-white/60 hover:text-white">
                    ✎
                  </button>
                </div>
              )}
              {canArrange && (
                <div className="flex shrink-0 flex-col">
                  <button
                    onClick={() => moveTrack(index, index - 1)}
                    disabled={saving || index === 0}
                    aria-label={t("media.moveTrackUp", { title: track.title })}
                    className="flex h-6 w-9 items-center justify-center text-[11px] text-white/70 hover:text-white disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveTrack(index, index + 1)}
                    disabled={saving || index === tracks.length - 1}
                    aria-label={t("media.moveTrackDown", { title: track.title })}
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
            <p className="text-xs text-white/60">{t("media.removeATrackTo")}</p>
          ) : (
            <>
              <form onSubmit={handleAddYoutube} className="flex flex-col gap-1.5 sm:flex-row">
                <input
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value)}
                  placeholder={t("media.trackTitle")}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none sm:w-32"
                />
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  maxLength={MAX_TRACK_ARTIST}
                  placeholder={t("media.artistOptional")}
                  aria-label={t("media.artistOptional")}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none sm:w-28"
                />
                <input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder={t("media.pasteAYoutubeLink")}
                  className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-[var(--profile-accent-fill)] px-3 py-1 text-xs font-medium text-[var(--profile-on-accent)]"
                >
                  {t("media.add")}
                </button>
              </form>
              <div className="flex gap-1.5">
                <input
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder={t("media.captionOptional")}
                  className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || atUploadLimit}
                  title={atUploadLimit ? t("media.uploadLimit", { max: MAX_UPLOADS }) : undefined}
                  className="shrink-0 rounded-md border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  {uploading ? t("picture.uploading") : t("media.uploadASong")}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
              <p className="text-[10px] text-white/60">
                {t("media.trackLimits", { max: MAX_TRACKS, uploads: MAX_UPLOADS, used: uploadCount })}
              </p>
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
