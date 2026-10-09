import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { critiquesApi } from "../api/critiques.api";
import { Avatar } from "../components/common/Avatar";
import { CSBadge } from "../components/common/CSBadge";
import { ReportButton } from "../components/common/ReportButton";
import { NoteForm, NoteText, PiecePreview } from "../components/critique/CritiqueParts";
import type { Critique, CritiqueNote } from "../types";
import { t } from "../i18n";

const small = "rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10 disabled:opacity-50";

/** One request for feedback: the piece and the question, a form to give feedback (or your own to change), and for its maker all the feedback. */
export function CritiquePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [critique, setCritique] = useState<Critique | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setCritique(null);
    setError(null);
    critiquesApi
      .get(id)
      .then((r) => live && setCritique(r.critique))
      .catch((err) => live && setError(err instanceof ApiError && err.status !== 404 ? err.message : t("critique.notFound")));
    return () => {
      live = false;
    };
  }, [id]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("critique.failed"));
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => setCritique((await critiquesApi.get(id)).critique);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
        <Link to="/critiques" className="text-sm text-violet-300 hover:underline">
          {t("critique.back")}
        </Link>
      </div>
    );
  }
  if (!critique) return <p className="px-4 py-6 text-center text-sm text-white/60">{t("common.loading")}</p>;

  const saved = (note: CritiqueNote) => {
    setCritique({ ...critique, myNote: note, noteCount: critique.myNote ? critique.noteCount : (critique.noteCount ?? 0) + 1 });
    setEditing(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link to="/critiques" className="text-sm text-violet-300 hover:underline">
        {t("critique.back")}
      </Link>

      <article className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
          <Link to={`/u/${critique.owner.username}`} className="flex items-center gap-2 hover:underline">
            <Avatar username={critique.owner.username} displayName={critique.owner.displayName} avatarUrl={critique.owner.avatarUrl} size={28} />
            <span>{t("critique.by", { name: critique.owner.displayName })}</span>
            <CSBadge verified={critique.owner.csVerified} size={12} />
          </Link>
          {critique.closed && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">{t("critique.closed")}</span>}
        </div>
        <h1 dir="auto" className="break-words text-xl font-semibold text-white">
          {critique.question || t("critique.noQuestion")}
        </h1>
        <PiecePreview piece={critique.piece} owner={critique.owner.username} className="max-h-[70vh] max-w-full" />
        <p className="flex flex-wrap items-center gap-x-4 text-xs text-white/60">
          <span>{t("critique.answers", { n: critique.noteCount ?? 0 })}</span>
          <Link to={`/u/${critique.owner.username}?piece=${critique.piece.id}#portfolio`} className="text-violet-300 hover:underline">
            {t("critique.openPiece")}
          </Link>
          {!critique.mine && <ReportButton targetType="critique" targetId={critique.id} label={t("critique.reportRequest")} />}
        </p>
      </article>

      {critique.mine ? (
        <>
          <div role="group" aria-label={t("critique.manage")} className="flex flex-wrap gap-2">
            {critique.status === "open" ? (
              <button type="button" disabled={busy} onClick={() => run(async () => { const { critique: c } = await critiquesApi.update(critique.id, { status: "closed" }); setCritique({ ...critique, status: c.status, closed: c.closed }); })} className={small}>
                {t("critique.close")}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => run(async () => { const { critique: c } = await critiquesApi.update(critique.id, { status: "open" }); setCritique({ ...critique, status: c.status, closed: c.closed }); })} className={small}>
                {t("critique.reopen")}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => window.confirm(t("critique.confirmDelete")) && void run(async () => { await critiquesApi.remove(critique.id); navigate("/critiques"); })} className={`${small} hover:text-red-400`}>
              {t("critique.delete")}
            </button>
          </div>
          {problem && (
            <p role="alert" className="text-xs text-red-400">
              {problem}
            </p>
          )}
          <section aria-label={t("critique.notesHeading")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-medium text-white">{t("critique.notesHeading")}</h2>
            {(critique.notes ?? []).length === 0 && <p className="text-xs text-white/60">{t("critique.noNotes")}</p>}
            <ul className="space-y-3">
              {(critique.notes ?? []).map((n) => (
                <li key={n.id} className="space-y-2 rounded-lg border border-white/10 p-3">
                  {n.author && (
                    <Link to={`/u/${n.author.username}`} className="flex items-center gap-2 text-sm font-medium text-white hover:underline">
                      <Avatar username={n.author.username} displayName={n.author.displayName} avatarUrl={n.author.avatarUrl} size={24} />
                      <span>{n.author.displayName}</span>
                      <CSBadge verified={n.author.csVerified} size={12} />
                    </Link>
                  )}
                  <NoteText note={n} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
                    {n.thanked ? (
                      <span className="font-medium text-violet-200">✓ {t("critique.thanked")}</span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => run(async () => { const { note } = await critiquesApi.thank(critique.id, n.id); setCritique({ ...critique, notes: (critique.notes ?? []).map((x) => (x.id === n.id ? { ...x, thanked: note.thanked } : x)) }); })} aria-label={t("critique.thankLabel", { name: n.author?.displayName ?? "" })} className="hover:text-white hover:underline">
                        {t("critique.thank")}
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => window.confirm(t("critique.confirmRemoveNote")) && void run(async () => { await critiquesApi.removeNote(critique.id, n.id); await reload(); })} aria-label={t("critique.removeNoteLabel", { name: n.author?.displayName ?? "" })} className="hover:text-red-400 hover:underline">
                      {t("critique.removeNote")}
                    </button>
                    <ReportButton targetType="critiqueNote" targetId={n.id} label={t("critique.reportNote", { name: n.author?.displayName ?? "" })} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : critique.myNote && !editing ? (
        <section aria-label={t("critique.yourNote")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-medium text-white">{t("critique.yourNote")}</h2>
          <NoteText note={critique.myNote} />
          {critique.myNote.thanked && <p className="text-xs font-medium text-violet-200">✓ {t("critique.makerThanked")}</p>}
          {!critique.closed && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className={small}>
                {t("critique.editNote")}
              </button>
              <button type="button" disabled={busy} onClick={() => run(async () => { await critiquesApi.withdrawMine(critique.id); setCritique({ ...critique, myNote: null, noteCount: Math.max(0, (critique.noteCount ?? 1) - 1) }); })} className={small}>
                {t("critique.withdraw")}
              </button>
            </div>
          )}
          {problem && (
            <p role="alert" className="text-xs text-red-400">
              {problem}
            </p>
          )}
        </section>
      ) : !critique.closed ? (
        <NoteForm critiqueId={critique.id} note={critique.myNote} onSaved={saved} onCancel={critique.myNote ? () => setEditing(false) : undefined} />
      ) : null}
    </div>
  );
}
