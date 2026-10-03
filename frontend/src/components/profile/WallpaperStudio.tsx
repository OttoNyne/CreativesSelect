import { useEffect, useRef, useState } from "react";
import { aiApi, type WallpaperCloseness } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import { MovingWallpaper } from "./MovingWallpaper";
import { ReferencePhotoField } from "../ai/ReferencePhotoField";
import { WALLPAPER_MOTIONS } from "../../lib/wallpaperMotion";
import { shrinkForUpload } from "../../lib/resizeImage";
import type { WallpaperMotion } from "../../types";

const MAX_PROMPT = 500;
const button = "rounded-md border px-3 py-1.5 text-xs font-medium";
const chip = (on: boolean) =>
  `${button} ${on ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/15 text-white/70 hover:bg-white/10"}`;

/**
 * Makes a profile wallpaper with AI from a description, and optionally from a reference photo, and lets the owner choose how
 * it moves. The result is shown first (moving, in a small box); only "Use this wallpaper" changes the profile.
 */
export function WallpaperStudio({
  hasWallpaper,
  isPicture,
  motion,
  onMotionChange,
  onUse,
}: {
  /** The profile already has a wallpaper. */
  hasWallpaper: boolean;
  /** …and it is a picture (a video wallpaper plays by itself, so has no motion to choose). */
  isPicture: boolean;
  /** How the current wallpaper moves. */
  motion: WallpaperMotion;
  /** The owner picked a motion for the wallpaper they already have. */
  onMotionChange: (motion: WallpaperMotion) => void;
  /** The owner chose a generated wallpaper to use. */
  onUse: (url: string, motion: WallpaperMotion) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState<File | null>(null);
  const [closeness, setCloseness] = useState<WallpaperCloseness>("balanced");
  // what the next generated wallpaper will do; a still picture isn't the point of this, so it starts moving
  const [newMotion, setNewMotion] = useState<WallpaperMotion>(motion === "none" ? "zoom" : motion);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; usedReference: boolean } | null>(null);
  const resultUrl = useRef<string | null>(null);

  // A picture that was made but not used is removed from storage, best effort, when it is replaced or the window closes.
  resultUrl.current = result?.url ?? null;
  useEffect(
    () => () => {
      if (resultUrl.current) void aiApi.discard(resultUrl.current);
    },
    []
  );

  async function discardResult() {
    const old = result;
    setResult(null);
    if (old) void aiApi.discard(old.url);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    await discardResult();
    try {
      const sent = reference ? await shrinkForUpload(reference) : undefined;
      setResult(await aiApi.generateWallpaper({ prompt, reference: sent, closeness }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make a wallpaper, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function use() {
    if (!result) return;
    setApplying(true);
    setError(null);
    try {
      await onUse(result.url, newMotion);
      resultUrl.current = null; // it is the wallpaper now; don't remove it
      setResult(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that wallpaper, try again.");
    } finally {
      setApplying(false);
    }
  }

  const canGenerate = prompt.trim().length > 0 && !busy;

  return (
    <section aria-label="AI wallpaper" className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div>
        <h3 className="text-sm font-semibold text-white">✨ Live wallpaper with AI</h3>
        <p className="text-xs text-white/70">Describe it, or start from one of your own photos, then choose how it moves.</p>
      </div>

      <label className="block text-xs text-white/70">
        What should it look like?
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={MAX_PROMPT}
          rows={2}
          placeholder="A rainy neon street at night, glowing puddles…"
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
      </label>

      <ReferencePhotoField file={reference} onFile={setReference} closeness={closeness} onCloseness={setCloseness} disabled={busy} />

      <fieldset>
        <legend className="text-xs text-white/70">How should it move?</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {WALLPAPER_MOTIONS.map((m) => {
            const current = result || !hasWallpaper || !isPicture ? newMotion : motion;
            return (
              <label key={m.value} title={m.hint} className={`${chip(current === m.value)} cursor-pointer`}>
                <input
                  type="radio"
                  name="motion"
                  value={m.value}
                  checked={current === m.value}
                  onChange={() => {
                    setNewMotion(m.value);
                    // with no new picture waiting, this changes the wallpaper the profile already has
                    if (!result && hasWallpaper && isPicture) onMotionChange(m.value);
                  }}
                  className="sr-only"
                />
                {m.label}
              </label>
            );
          })}
        </div>
        {!result && hasWallpaper && isPicture && <p className="mt-1 text-xs text-white/60">This changes your current wallpaper straight away.</p>}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          title={prompt.trim() ? undefined : "Type a description first"}
          className="rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50"
        >
          {busy ? "Creating your wallpaper…" : result ? "✨ Try again" : "✨ Generate live wallpaper"}
        </button>
        {busy && <span role="status" className="text-xs text-white/70">This can take up to a minute{reference ? " with a photo" : ""}.</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2" aria-label="Your new wallpaper">
          <div className="relative h-40 overflow-hidden rounded-lg border border-white/10">
            {newMotion === "none" ? (
              <img src={result.url} alt="Your new wallpaper" className="h-full w-full object-cover" />
            ) : (
              <>
                <MovingWallpaper url={result.url} position="50% 50%" motion={newMotion} className="absolute inset-0" />
                <img src={result.url} alt="Your new wallpaper" className="sr-only" />
              </>
            )}
          </div>
          <p className="text-xs text-white/70">
            {result.usedReference ? "Made from your photo and description." : "Made from your description."} Like it? Use it, or try again.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={use} disabled={applying} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {applying ? "Saving…" : "Use this wallpaper"}
            </button>
            <button type="button" onClick={discardResult} disabled={applying} className={`${button} border-white/15 text-white/70 hover:bg-white/10`}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
