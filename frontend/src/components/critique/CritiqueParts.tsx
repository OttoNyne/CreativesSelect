import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, assetUrl } from "../../api/client";
import { critiquesApi } from "../../api/critiques.api";
import type { Critique, CritiqueNote } from "../../types";
import { Avatar } from "../common/Avatar";
import { CSBadge } from "../common/CSBadge";
import { t } from "../../i18n";

/** The piece being asked about: the picture itself, or a link to open it. */
export function PiecePreview({ piece, owner, className = "" }: { piece: Critique["piece"]; owner: string; className?: string }) {
  if (piece.type === "image") {
    return <img src={assetUrl(piece.url)} alt={t("critique.pieceAlt", { name: piece.caption ?? "" })} loading="lazy" className={`rounded-lg border border-white/10 object-contain ${className}`} />;
  }
  return (
    <Link to={`/u/${owner}?piece=${piece.id}#portfolio`} className="inline-block rounded-md border border-white/20 px-3 py-2 text-sm text-violet-300 hover:underline">
      {piece.caption || t("critique.openPiece")}
    </Link>
  );
}

/** One request in a list: the piece, who is asking and what, how many have answered, and whether you did. Opens the request. */
export function CritiqueCard({ critique }: { critique: Critique }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex gap-3">
        <Link to={`/critiques/${critique.id}`} className="shrink-0" aria-label={critique.piece.caption ?? t("critique.openPiece")}>
          {critique.piece.type === "image" ? <img src={assetUrl(critique.piece.url)} alt="" loading="lazy" className="h-20 w-20 rounded-md border border-white/10 object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-md border border-white/10 bg-black/30 px-1 text-center text-[11px] text-white/70">{critique.piece.type}</span>}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs text-white/60">
            <Link to={`/u/${critique.owner.username}`} className="flex items-center gap-1.5 hover:underline">
              <Avatar username={critique.owner.username} displayName={critique.owner.displayName} avatarUrl={critique.owner.avatarUrl} size={18} />
              <span>{t("critique.by", { name: critique.owner.displayName })}</span>
              <CSBadge verified={critique.owner.csVerified} size={11} />
            </Link>
            {critique.closed && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">{t("critique.closed")}</span>}
          </p>
          <h2 className="mt-1 text-base font-medium text-white">
            <Link to={`/critiques/${critique.id}`} dir="auto" className="break-words hover:underline">
              {critique.question || t("critique.noQuestion")}
            </Link>
          </h2>
          <p className="mt-1 text-xs text-white/60">
            {t("critique.answers", { n: critique.noteCount ?? 0 })}
            {critique.answered && <span className="ms-2 font-medium text-violet-200">· {t("critique.youGave")}</span>}
          </p>
        </div>
      </div>
    </article>
  );
}

/** Give feedback, or change what you gave: two boxes (what is working, what you would change), at least one filled in. */
export function NoteForm({ critiqueId, note, onSaved, onCancel }: { critiqueId: string; note?: CritiqueNote | null; onSaved: (note: CritiqueNote) => void; onCancel?: () => void }) {
  const [working, setWorking] = useState(note?.working ?? "");
  const [change, setChange] = useState(note?.change ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!working.trim() && !change.trim()) return setError(t("critique.needSomething"));
    setBusy(true);
    setError(null);
    try {
      const input = { working: working.trim(), change: change.trim() };
      const { note: saved } = note ? await critiquesApi.editMine(critiqueId, input) : await critiquesApi.give(critiqueId, input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("critique.failed"));
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";
  return (
    <form onSubmit={submit} aria-label={t("critique.formHeading")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium text-white">{t("critique.formHeading")}</h2>
      <p className="text-xs text-white/60">{t("critique.privacy")}</p>
      <label className="block text-xs text-white/70">
        {t("critique.working")}
        <textarea value={working} onChange={(e) => setWorking(e.target.value)} maxLength={500} rows={3} dir="auto" placeholder={t("critique.workingPlaceholder")} className={field} />
      </label>
      <label className="block text-xs text-white/70">
        {t("critique.change")}
        <textarea value={change} onChange={(e) => setChange(e.target.value)} maxLength={500} rows={3} dir="auto" placeholder={t("critique.changePlaceholder")} className={field} />
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? t("critique.submitting") : note ? t("critique.saveNote") : t("critique.submit")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-white/70 hover:text-white hover:underline disabled:opacity-50">
            {t("critique.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

/** What someone wrote, in its two parts (the one that is empty is left out). */
export function NoteText({ note }: { note: Pick<CritiqueNote, "working" | "change"> }) {
  return (
    <div className="space-y-2 text-sm">
      {note.working && (
        <div>
          <h3 className="text-xs font-medium text-white/60">{t("critique.working")}</h3>
          <p dir="auto" className="whitespace-pre-line break-words text-white/90">
            {note.working}
          </p>
        </div>
      )}
      {note.change && (
        <div>
          <h3 className="text-xs font-medium text-white/60">{t("critique.change")}</h3>
          <p dir="auto" className="whitespace-pre-line break-words text-white/90">
            {note.change}
          </p>
        </div>
      )}
    </div>
  );
}
