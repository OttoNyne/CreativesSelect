import { useEffect, useState } from "react";
import { ApiError, assetUrl } from "../../api/client";
import { callsApi } from "../../api/calls.api";
import { mediaApi } from "../../api/media.api";
import { useAuth } from "../../context/AuthContext";
import type { MediaItem, OpenCall } from "../../types";
import { t } from "../../i18n";

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

/** Answer a call: a few words and/or one of your own pieces. Once you have, shows your answer (with the owner's note) and lets you take it back. */
export function ApplyForm({ call, onChange }: { call: OpenCall; onChange: (call: OpenCall) => void }) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [piece, setPiece] = useState("");
  const [pieces, setPieces] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = call.myApplication;

  useEffect(() => {
    if (!user || mine) return;
    let live = true;
    mediaApi
      .byUser(user.username)
      .then((r) => live && setPieces(r.media.filter((m) => m.type === "image" || m.type === "video" || m.type === "audio")))
      .catch(() => live && setPieces([]));
    return () => {
      live = false;
    };
  }, [user, mine]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!note.trim() && !piece) return setError(t("calls.needSomething"));
    setBusy(true);
    setError(null);
    try {
      await callsApi.apply(call.id, { ...(note.trim() ? { note: note.trim() } : {}), ...(piece ? { piece } : {}) });
      onChange((await callsApi.get(call.id)).call);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calls.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await callsApi.withdraw(call.id);
      onChange((await callsApi.get(call.id)).call);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calls.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (mine) {
    const label = { waiting: t("calls.statusWaiting"), chosen: t("calls.statusChosen"), passed: t("calls.statusPassed") }[mine.status];
    return (
      <section aria-label={t("calls.yourAnswer")} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium text-white">
          {t("calls.yourAnswer")}: <span className="text-violet-200">{label}</span>
        </h2>
        {mine.note && (
          <p dir="auto" className="whitespace-pre-line break-words text-sm text-white/80">
            {mine.note}
          </p>
        )}
        {mine.reply && (
          <p dir="auto" className="whitespace-pre-line break-words rounded-md bg-white/5 p-2 text-sm text-white/90">
            <span className="text-xs text-white/60">{t("calls.theirNote")}: </span>
            {mine.reply}
          </p>
        )}
        {mine.status === "waiting" && (
          <button type="button" onClick={withdraw} disabled={busy} className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
            {t("calls.withdraw")}
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={submit} aria-label={t("calls.applyTitle")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium text-white">{t("calls.applyTitle")}</h2>
      <label className="block text-xs text-white/70">
        {t("calls.noteLabel")}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} dir="auto" placeholder={t("calls.notePlaceholder")} className={`${field} mt-1`} />
      </label>
      {pieces && pieces.length === 0 && <p className="text-xs text-white/60">{t("calls.noPiecesYet")}</p>}
      {pieces && pieces.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs text-white/70">{t("calls.pieceLabel")}</legend>
          <div className="flex flex-wrap gap-2">
            <label className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs focus-within:ring-2 focus-within:ring-violet-300 ${piece === "" ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70"}`}>
              <input type="radio" name={`piece-${call.id}`} checked={piece === ""} onChange={() => setPiece("")} className="sr-only" />
              {t("calls.noPiece")}
            </label>
            {pieces.slice(0, 12).map((m) => (
              <label key={m.id} className={`cursor-pointer overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-violet-300 ${piece === m.id ? "border-violet-400 ring-2 ring-violet-400" : "border-white/20"}`}>
                <input type="radio" name={`piece-${call.id}`} checked={piece === m.id} onChange={() => setPiece(m.id)} className="sr-only" aria-label={m.caption || m.url} />
                {m.type === "image" ? <img src={assetUrl(m.url)} alt="" className="h-14 w-14 object-cover" /> : <span className="flex h-14 w-14 items-center justify-center bg-black/40 px-1 text-center text-[10px] text-white/80">{m.caption || m.type}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
        {busy ? t("calls.sending") : t("calls.applyButton")}
      </button>
    </form>
  );
}
