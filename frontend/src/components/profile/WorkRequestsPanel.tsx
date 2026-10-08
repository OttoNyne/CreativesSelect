import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { workRequestsApi, MAX_REPLY } from "../../api/workRequests.api";
import { formatDay } from "../../lib/when";
import { t } from "../../i18n";
import type { WorkRequest } from "../../types";

const small = "text-xs text-white/70 hover:text-white hover:underline disabled:opacity-50";

/** One request waiting for the owner: the brief, with Accept and Decline and a short note for the asker. */
function Received({ request, onDone }: { request: WorkRequest; onDone: (request: WorkRequest, status: "accepted" | "declined", reply: string) => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = request.status === "open";

  async function answer(accept: boolean) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await workRequestsApi.answer(request.id, accept, reply.trim() || undefined);
      onDone(request, accept ? "accepted" : "declined", reply.trim());
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("credits.couldntDoThat"));
      setBusy(false);
    }
  }

  return (
    <li className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs text-white/80">
      <p>
        <Link to={`/u/${request.from?.username}`} className="font-medium text-[var(--profile-accent-text)] hover:underline">
          {request.from?.displayName}
        </Link>{" "}
        <span className="text-white/60">· {formatDay(request.createdAt)}</span>
      </p>
      <p dir="auto" className="text-sm font-medium text-white">
        {request.title}
      </p>
      <p dir="auto" className="whitespace-pre-line break-words">
        {request.details}
      </p>
      {(request.budget || request.deadline) && (
        <p className="text-white/60">
          {request.budget && <span dir="auto">{t("work.budgetIs", { budget: request.budget })}</span>}
          {request.budget && request.deadline && " · "}
          {request.deadline && <span>{t("work.deadlineIs", { day: formatDay(request.deadline) })}</span>}
        </p>
      )}
      {waiting ? (
        <div className="space-y-1.5">
          <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={MAX_REPLY} dir="auto" placeholder={t("work.replyPlaceholder")} aria-label={t("work.replyLabel")} className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:outline-none" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => answer(true)} className="rounded-md bg-[var(--profile-accent-fill)] px-2.5 py-1 font-medium text-[var(--profile-on-accent)] disabled:opacity-50">
              {t("friends.accept")}
            </button>
            <button type="button" disabled={busy} onClick={() => answer(false)} className="rounded-md border border-white/20 px-2.5 py-1 text-white/80 hover:bg-white/10 disabled:opacity-50">
              {t("friends.decline")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-white/60">
          {request.status === "accepted" ? t("work.youAccepted") : t("work.youDeclined")}
          {request.reply && <span dir="auto"> — {request.reply}</span>}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-red-400">
          {problem}
        </p>
      )}
    </li>
  );
}

/**
 * Work requests on your own profile: what people have asked of you (answer them, or clear the ones you've answered) and what you have asked
 * of others, with their answers. Nothing at all while there are none.
 */
export function WorkRequestsPanel() {
  const [received, setReceived] = useState<WorkRequest[] | null>(null);
  const [sent, setSent] = useState<WorkRequest[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([workRequestsApi.received(), workRequestsApi.sent()])
      .then(([r, s]) => {
        if (!current) return;
        setReceived(r.requests);
        setSent(s.requests);
      })
      .catch(() => current && setReceived([])); // a list that can't be loaded is just not shown
    return () => {
      current = false;
    };
  }, []);

  async function drop(request: WorkRequest, list: "received" | "sent") {
    setProblem(null);
    try {
      await workRequestsApi.remove(request.id);
      if (list === "received") setReceived((rows) => (rows ?? []).filter((r) => r.id !== request.id));
      else setSent((rows) => rows.filter((r) => r.id !== request.id));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("credits.couldntDoThat"));
    }
  }

  const answered = (request: WorkRequest, status: "accepted" | "declined", reply: string) => setReceived((rows) => (rows ?? []).map((r) => (r.id === request.id ? { ...r, status, reply } : r)));

  if (!received || (received.length === 0 && sent.length === 0)) return null;
  return (
    <section id="work" aria-label={t("work.requestsTitle")} className="mt-4 space-y-3 scroll-mt-20">
      {received.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--profile-muted)]">{t("work.requestsTitle")}</h3>
          <ul className="mt-2 space-y-2">
            {received.map((r) => (
              <div key={r.id}>
                <Received request={r} onDone={answered} />
                {r.status !== "open" && (
                  <button type="button" onClick={() => drop(r, "received")} className={`${small} mt-0.5`}>
                    {t("work.clear")}
                  </button>
                )}
              </div>
            ))}
          </ul>
        </div>
      )}
      {sent.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--profile-muted)]">{t("work.sentTitle")}</h3>
          <ul className="mt-2 space-y-2">
            {sent.map((r) => (
              <li key={r.id} className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs text-white/80">
                <p>
                  <span dir="auto" className="text-sm font-medium text-white">
                    {r.title}
                  </span>{" "}
                  <span className="text-white/60">
                    → <Link to={`/u/${r.to?.username}`} className="hover:underline">{r.to?.displayName}</Link>
                  </span>
                </p>
                <p className="text-white/60">
                  {r.status === "open" ? t("work.waiting") : r.status === "accepted" ? t("work.theyAccepted") : t("work.theyDeclined")}
                  {r.reply && <span dir="auto"> — {r.reply}</span>}
                </p>
                {r.status === "open" && (
                  <button type="button" onClick={() => drop(r, "sent")} className={small}>
                    {t("work.withdraw")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}
