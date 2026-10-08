import { useEffect, useRef, useState } from "react";
import { aiApi, type WallpaperCloseness } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import { MovingWallpaper } from "./MovingWallpaper";
import { ReferencePhotoField } from "../ai/ReferencePhotoField";
import { WALLPAPER_MOTIONS } from "../../lib/wallpaperMotion";
import { shrinkForUpload } from "../../lib/resizeImage";
import type { WallpaperMotion } from "../../types";
import { t } from "../../i18n";

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
      setError(err instanceof ApiError ? err.message : t("profile.couldntMakeAWallpaper"));
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
      setError(err instanceof ApiError ? err.message : t("profile.couldntSaveThatWallpaper"));
    } finally {
      setApplying(false);
    }
  }

  const canGenerate = prompt.trim().length > 0 && !busy;

  return (
    <section aria-label={t("profile.aiWallpaper")} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{t("profile.liveWallpaperWithAi")}</h3>
        <p className="text-xs text-white/70">{t("profile.describeItOrStart")}</p>
      </div>

      <label className="block text-xs text-white/70">
        {t("profile.whatShouldItLook")}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={MAX_PROMPT}
          rows={2}
          placeholder={t("profile.aRainyNeonStreet")}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
      </label>

      <ReferencePhotoField file={reference} onFile={setReference} closeness={closeness} onCloseness={setCloseness} disabled={busy} />

      <fieldset>
        <legend className="text-xs text-white/70">{t("profile.howShouldItMove")}</legend>
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
        {!result && hasWallpaper && isPicture && <p className="mt-1 text-xs text-white/60">{t("profile.thisChangesYourCurrent")}</p>}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          title={prompt.trim() ? undefined : t("ai.typeDescription")}
          className="rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50"
        >
          {busy ? t("profile.creatingYourWallpaper") : result ? t("profile.tryAgain") : t("profile.generateLiveWallpaper")}
        </button>
        {busy && <span role="status" className="text-xs text-white/70">{reference ? t("profile.wallpaperWaitPhoto") : t("profile.wallpaperWait")}</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2" aria-label={t("profile.yourNewWallpaper")}>
          <div className="relative h-40 overflow-hidden rounded-lg border border-white/10">
            {newMotion === "none" ? (
              <img src={result.url} alt={t("profile.yourNewWallpaper")} className="h-full w-full object-cover" />
            ) : (
              <>
                <MovingWallpaper url={result.url} position="50% 50%" motion={newMotion} className="absolute inset-0" />
                <img src={result.url} alt={t("profile.yourNewWallpaper")} className="sr-only" />
              </>
            )}
          </div>
          <p className="text-xs text-white/70">
            {result.usedReference ? t("profile.madeFromYourPhoto") : t("profile.madeFromYourDescription")} {t("profile.likeIt")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={use} disabled={applying} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {applying ? t("reset.saving") : t("profile.useThisWallpaper")}
            </button>
            <button type="button" onClick={discardResult} disabled={applying} className={`${button} border-white/15 text-white/70 hover:bg-white/10`}>
              {t("profile.discard")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
