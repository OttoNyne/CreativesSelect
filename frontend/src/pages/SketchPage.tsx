import { useCallback, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { challengesApi } from "../api/challenges.api";
import { uploadFile } from "../api/media.api";
import { SparkDice } from "../components/play/SparkDice";
import { Sketchpad } from "../components/play/Sketchpad";
import { useAuth } from "../context/AuthContext";
import { clearDraft } from "../lib/sketch";
import { decodeSpark, sparkText, type Spark } from "../lib/sparks";
import type { MediaItem } from "../types";
import { t } from "../i18n";

const MAX_CAPTION = 200;
const DEFAULT_TAG = "#sketchpad";

/** The drawing as a PNG file, or null if the browser can't make one. */
const pictureOf = (canvas: HTMLCanvasElement) =>
  new Promise<File | null>((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], "sketch.png", { type: "image/png" }) : null), "image/png"));

export function SketchPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const spark = decodeSpark(params.get("spark"));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState(0);
  const [round, setRound] = useState(0); // a new number gives a fresh page
  const [typed, setTyped] = useState<string | null>(null); // null until the person writes their own caption
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [posted, setPosted] = useState<MediaItem | null>(null);
  const [challenge, setChallenge] = useState<"idle" | "busy" | "done">("idle");
  const [challengeProblem, setChallengeProblem] = useState<string | null>(null);

  // the caption starts from the spark being drawn, until the person writes their own
  const caption = typed ?? (spark ? `${sparkText(spark)} ${DEFAULT_TAG}`.slice(0, MAX_CAPTION) : DEFAULT_TAG);

  const chooseSpark = useCallback((next: Spark | null) => setParams(next ? { spark: `${next.subject}-${next.twist}-${next.limit}` } : {}, { replace: true }), [setParams]);

  async function download() {
    const canvas = canvasRef.current;
    const file = canvas && (await pictureOf(canvas));
    if (!file) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    if (!strokes) return setProblem(t("play.drawFirst"));
    setBusy(true);
    setProblem(null);
    try {
      const file = await pictureOf(canvas);
      if (!file) throw new Error("no picture");
      const { mediaItem } = await uploadFile(file, "portfolio", caption.trim() || undefined);
      if (!mediaItem) throw new Error("no piece");
      clearDraft();
      setPosted(mediaItem);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("play.postFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function enterChallenge() {
    if (!posted || challenge === "busy") return;
    setChallenge("busy");
    setChallengeProblem(null);
    try {
      await challengesApi.enter(posted.id);
      setChallenge("done");
    } catch (err) {
      setChallenge("idle");
      setChallengeProblem(err instanceof ApiError ? err.message : t("play.enterFailed"));
    }
  }

  function another() {
    clearDraft();
    setPosted(null);
    setChallenge("idle");
    setChallengeProblem(null);
    setProblem(null);
    setTyped(null);
    setStrokes(0);
    setRound((n) => n + 1);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t("play.title")}</h1>
        <p className="text-sm text-white/70">{t("play.intro")}</p>
      </header>

      {user && (
        <p className="text-sm">
          <Link to="/chains" className="text-violet-300 hover:underline">
            {t("chain.sketchLink")}
          </Link>
        </p>
      )}

      {spark ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
          <p dir="auto" className="text-sm font-medium text-white">
            {t("play.sparkInUse", { spark: sparkText(spark) })}
          </p>
          <button type="button" onClick={() => chooseSpark(null)} className="rounded-md border border-white/25 px-3 py-1 text-sm text-white hover:bg-white/10">
            {t("play.dropSpark")}
          </button>
        </div>
      ) : (
        <SparkDice onUse={chooseSpark} />
      )}

      {posted ? (
        <section aria-label={t("play.posted")} className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <p role="status" className="text-sm font-medium text-emerald-300">
            {t("play.posted")}
          </p>
          <img src={posted.url} alt={posted.caption ?? ""} className="max-h-80 rounded-lg border border-white/10" />
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/u/${user?.username}`} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
              {t("play.viewProfile")}
            </Link>
            {!user?.isPrivate && challenge !== "done" && (
              <button type="button" onClick={enterChallenge} disabled={challenge === "busy"} className="rounded-md border border-white/25 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50">
                {challenge === "busy" ? t("play.entering") : t("play.enterChallenge")}
              </button>
            )}
            <button type="button" onClick={another} className="rounded-md border border-white/25 px-3 py-1.5 text-sm text-white hover:bg-white/10">
              {t("play.another")}
            </button>
          </div>
          {challenge === "done" && (
            <p role="status" className="text-sm text-emerald-300">
              {t("play.entered")}{" "}
              <Link to="/challenge" className="underline">
                {t("nav.challenge")}
              </Link>
            </p>
          )}
          {challengeProblem && (
            <p role="alert" className="text-sm text-red-400">
              {challengeProblem}
            </p>
          )}
        </section>
      ) : (
        <>
          <Sketchpad key={round} canvasRef={canvasRef} onStrokes={setStrokes} />

          <section aria-label={t("play.postTitle")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-white">{t("play.postTitle")}</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} disabled={!strokes} className="rounded-md border border-white/25 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-40">
                {t("play.download")}
              </button>
            </div>
            {user ? (
              <form onSubmit={post} className="space-y-2">
                <label className="block text-sm text-white/80">
                  {t("play.caption")}
                  <input
                    value={caption}
                    maxLength={MAX_CAPTION}
                    dir="auto"
                    onChange={(e) => setTyped(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-white/20 bg-black/40 px-2 py-2 text-sm text-white"
                  />
                </label>
                <p className="text-xs text-white/60">{t("play.captionHint")}</p>
                <button type="submit" disabled={busy || !strokes} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                  {busy ? t("play.posting") : t("play.post")}
                </button>
              </form>
            ) : (
              <p className="text-sm text-white/70">
                {t("play.signInToPost")}{" "}
                <Link to="/register" className="font-medium text-violet-300 hover:underline">
                  {t("common.signUp")}
                </Link>{" "}
                <Link to="/login" className="text-violet-300 hover:underline">
                  {t("common.logIn")}
                </Link>
              </p>
            )}
            {problem && (
              <p role="alert" className="text-sm text-red-400">
                {problem}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
