import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, assetUrl } from "../../api/client";
import { callsApi } from "../../api/calls.api";
import type { CallApplicationRow, CallPerson } from "../../types";
import { Avatar } from "../common/Avatar";
import { CSBadge } from "../common/CSBadge";
import { t } from "../../i18n";

const STATUS = { waiting: "calls.statusWaiting", chosen: "calls.statusChosen", passed: "calls.statusPassed" } as const;
const small = "rounded-md border border-white/20 px-3 py-1 text-xs text-white/90 hover:bg-white/10 disabled:opacity-50";

/** For the owner of a call: who answered it, with their words and piece, and a way to choose them or pass (with a note they see). */
export function ApplicationsPanel({ callId, onChanged }: { callId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<CallApplicationRow[] | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    callsApi
      .applications(callId)
      .then((r) => live && setRows(r.applications))
      .catch((err) => {
        if (!live) return;
        setRows([]);
        setProblem(err instanceof ApiError ? err.message : t("calls.loadFailed"));
      });
    return () => {
      live = false;
    };
  }, [callId]);

  async function answer(row: CallApplicationRow, choose: boolean) {
    setBusy(row.id);
    setProblem(null);
    try {
      const { application } = await callsApi.answer(callId, row.id, choose, replies[row.id]?.trim() || undefined);
      setRows((list) => (list ?? []).map((r) => (r.id === row.id ? { ...r, status: application.status, reply: application.reply } : r)));
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("calls.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label={t("calls.answersHeading")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium text-white">{t("calls.answersHeading")}</h2>
      {rows === null && <p className="text-xs text-white/60">{t("common.loading")}</p>}
      {rows?.length === 0 && <p className="text-xs text-white/60">{t("calls.noAnswers")}</p>}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="space-y-2 rounded-lg border border-white/10 p-3">
            <div className="flex items-center gap-2">
              <Link to={`/u/${row.applicant.username}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-white hover:underline">
                <Avatar username={row.applicant.username} displayName={row.applicant.displayName} avatarUrl={row.applicant.avatarUrl} size={28} />
                <span className="truncate">{row.applicant.displayName}</span>
                <CSBadge verified={row.applicant.csVerified} size={12} />
              </Link>
              <span className="shrink-0 text-xs text-white/70">{t(STATUS[row.status])}</span>
            </div>
            {row.note && (
              <p dir="auto" className="whitespace-pre-line break-words text-sm text-white/85">
                {row.note}
              </p>
            )}
            {row.piece && (
              <Link to={`/u/${row.applicant.username}?piece=${row.piece.id}#portfolio`} className="inline-block" aria-label={t("calls.pieceOf", { name: row.applicant.displayName })}>
                {row.piece.type === "image" ? (
                  <img src={assetUrl(row.piece.url)} alt={row.piece.caption ?? ""} className="max-h-40 rounded-md border border-white/10 object-contain" />
                ) : (
                  <span className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80">{row.piece.caption || row.piece.type}</span>
                )}
              </Link>
            )}
            {row.status === "waiting" ? (
              <div className="space-y-2">
                <input
                  value={replies[row.id] ?? ""}
                  onChange={(e) => setReplies((r) => ({ ...r, [row.id]: e.target.value }))}
                  maxLength={300}
                  dir="auto"
                  aria-label={t("calls.replyLabel", { name: row.applicant.displayName })}
                  placeholder={t("calls.replyLabel", { name: row.applicant.displayName })}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button type="button" disabled={busy === row.id} onClick={() => answer(row, true)} aria-label={t("calls.chooseLabel", { name: row.applicant.displayName })} className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                    {t("calls.choose")}
                  </button>
                  <button type="button" disabled={busy === row.id} onClick={() => answer(row, false)} aria-label={t("calls.passLabel", { name: row.applicant.displayName })} className={small}>
                    {t("calls.pass")}
                  </button>
                </div>
              </div>
            ) : (
              row.reply && (
                <p dir="auto" className="break-words text-xs text-white/70">
                  {row.reply}
                </p>
              )
            )}
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}

/** For the owner of a call: people open to work whose offers or tags fit what it looks for, best fit first, each linking to their profile. */
export function MatchesPanel({ callId }: { callId: string }) {
  const [people, setPeople] = useState<CallPerson[] | null>(null);

  useEffect(() => {
    let live = true;
    callsApi
      .matches(callId)
      .then((r) => live && setPeople(r.people))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [callId]);

  return (
    <section aria-label={t("calls.matches")} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium text-white">{t("calls.matches")}</h2>
      <p className="text-xs text-white/60">{t("calls.matchesHint")}</p>
      {people === null && <p className="text-xs text-white/60">{t("common.loading")}</p>}
      {people?.length === 0 && <p className="text-xs text-white/60">{t("calls.noMatches")}</p>}
      <ul className="space-y-2">
        {people?.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <Link to={`/u/${p.username}`} aria-label={t("calls.viewProfile", { name: p.displayName })} className="flex min-w-0 flex-1 items-center gap-2 text-white hover:underline">
              <Avatar username={p.username} displayName={p.displayName} avatarUrl={p.avatarUrl} size={28} />
              <span className="truncate">{p.displayName}</span>
              <CSBadge verified={p.csVerified} size={12} />
            </Link>
            <span className="shrink-0 text-xs text-violet-200">{t("calls.matched", { roles: p.matched.join(", ") })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
