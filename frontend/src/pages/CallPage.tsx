import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { callsApi } from "../api/calls.api";
import { ApplyForm } from "../components/calls/ApplyForm";
import { CallForm } from "../components/calls/CallForm";
import { ApplicationsPanel, MatchesPanel } from "../components/calls/CallOwnerPanels";
import { Avatar } from "../components/common/Avatar";
import { CSBadge } from "../components/common/CSBadge";
import { Linkified } from "../components/common/Linkified";
import { formatCalendarDay } from "../lib/when";
import type { OpenCall } from "../types";
import { t } from "../i18n";

/** One open call: what it asks for, a way to answer it, and for its owner the answers, the people who might fit, and ways to close or change it. */
export function CallPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [call, setCall] = useState<OpenCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCall((await callsApi.get(id)).call);
    } catch {
      /* the page keeps what it has */
    }
  }, [id]);

  useEffect(() => {
    let live = true;
    setCall(null);
    setError(null);
    callsApi
      .get(id)
      .then((r) => live && setCall(r.call))
      .catch((err) => live && setError(err instanceof ApiError && err.status !== 404 ? err.message : t("calls.notFound")));
    return () => {
      live = false;
    };
  }, [id]);

  async function setStatus(status: "open" | "closed") {
    if (!call) return;
    setBusy(true);
    setProblem(null);
    try {
      const { call: saved } = await callsApi.update(call.id, { status });
      setCall({ ...call, ...saved });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("calls.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!call || !window.confirm(t("calls.confirmDelete"))) return;
    setBusy(true);
    setProblem(null);
    try {
      await callsApi.remove(call.id);
      navigate("/calls");
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("calls.failed"));
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
        <Link to="/calls" className="text-sm text-violet-300 hover:underline">
          {t("calls.back")}
        </Link>
      </div>
    );
  }
  if (!call) return <p className="px-4 py-6 text-center text-sm text-white/60">{t("common.loading")}</p>;

  const small = "rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10 disabled:opacity-50";
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link to="/calls" className="text-sm text-violet-300 hover:underline">
        {t("calls.back")}
      </Link>

      {editing ? (
        <CallForm
          call={call}
          onCancel={() => setEditing(false)}
          onDone={(saved) => {
            setCall({ ...call, ...saved });
            setEditing(false);
          }}
        />
      ) : (
        <article className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start gap-3">
            <Link to={`/u/${call.owner.username}`} className="shrink-0">
              <Avatar username={call.owner.username} displayName={call.owner.displayName} avatarUrl={call.owner.avatarUrl} size={40} />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 dir="auto" className="break-words text-xl font-semibold text-white">
                {call.title}
              </h1>
              <p className="text-sm text-white/60">
                <Link to={`/u/${call.owner.username}`} className="hover:underline">
                  {t("calls.by", { name: call.owner.displayName })}
                </Link>
                <CSBadge verified={call.owner.csVerified} size={12} className="ms-1" />
              </p>
            </div>
            {call.closed && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">{t("calls.closed")}</span>}
          </div>
          <p dir="auto" className="whitespace-pre-line break-words text-sm text-white/90">
            <Linkified text={call.details} />
          </p>
          {call.lookingFor.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-white/60">{t("calls.lookingFor")}</h2>
              <ul aria-label={t("calls.rolesList")} className="mt-1 flex flex-wrap gap-1.5">
                {call.lookingFor.map((role) => (
                  <li key={role} className={`rounded-full border px-2.5 py-0.5 text-xs ${call.match?.includes(role) ? "border-violet-300 bg-violet-500/25 text-white" : "border-white/20 text-white/80"}`}>
                    <bdi>{role}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
            {call.match && call.match.length > 0 && <span className="font-medium text-violet-200">{t("calls.fits", { roles: call.match.join(", ") })}</span>}
            {call.budget && (
              <span dir="auto">
                {t("calls.budget")}: {call.budget}
              </span>
            )}
            {call.deadline && <span>{t("calls.deadline", { date: formatCalendarDay(call.deadline) })}</span>}
          </div>
        </article>
      )}

      {call.mine ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("calls.manage")}>
            <button type="button" onClick={() => setEditing(true)} disabled={busy || editing} className={small}>
              {t("calls.edit")}
            </button>
            {call.status === "open" ? (
              <button type="button" onClick={() => setStatus("closed")} disabled={busy} className={small}>
                {t("calls.close")}
              </button>
            ) : (
              <button type="button" onClick={() => setStatus("open")} disabled={busy} className={small}>
                {t("calls.reopen")}
              </button>
            )}
            <button type="button" onClick={remove} disabled={busy} className={`${small} hover:text-red-400`}>
              {t("calls.delete")}
            </button>
          </div>
          {problem && (
            <p role="alert" className="text-xs text-red-400">
              {problem}
            </p>
          )}
          <ApplicationsPanel callId={call.id} onChanged={reload} />
          <MatchesPanel callId={call.id} />
        </>
      ) : call.closed && !call.myApplication ? null : (
        <ApplyForm call={call} onChange={setCall} />
      )}
    </div>
  );
}
