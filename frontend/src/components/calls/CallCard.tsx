import { Link } from "react-router-dom";
import type { OpenCall } from "../../types";
import { Avatar } from "../common/Avatar";
import { CSBadge } from "../common/CSBadge";
import { formatCalendarDay } from "../../lib/when";
import { t } from "../../i18n";

const STATUS = { waiting: "calls.statusWaiting", chosen: "calls.statusChosen", passed: "calls.statusPassed" } as const;

/** One call in a list: who is asking, what for, the roles, and how it stands for the viewer. Opens the call. */
export function CallCard({ call, status }: { call: OpenCall; /** the viewer's answer, when listing what they answered */ status?: "waiting" | "chosen" | "passed" }) {
  const answered = status ?? call.applied ?? null;
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <Link to={`/u/${call.owner.username}`} className="shrink-0">
          <Avatar username={call.owner.username} displayName={call.owner.displayName} avatarUrl={call.owner.avatarUrl} size={36} />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium text-white">
            <Link to={`/calls/${call.id}`} dir="auto" className="break-words hover:underline">
              {call.title}
            </Link>
          </h2>
          <p className="text-xs text-white/60">
            {t("calls.by", { name: call.owner.displayName })}
            <CSBadge verified={call.owner.csVerified} size={12} className="ms-1" />
          </p>
        </div>
        {call.closed && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">{t("calls.closed")}</span>}
      </div>
      <p dir="auto" className="mt-2 line-clamp-3 whitespace-pre-line break-words text-sm text-white/80">
        {call.details}
      </p>
      {call.lookingFor.length > 0 && (
        <ul aria-label={t("calls.rolesList")} className="mt-2 flex flex-wrap gap-1.5">
          {call.lookingFor.map((role) => (
            <li key={role} className={`rounded-full border px-2.5 py-0.5 text-xs ${call.match?.includes(role) ? "border-violet-300 bg-violet-500/25 text-white" : "border-white/20 text-white/80"}`}>
              <bdi>{role}</bdi>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
        {call.match && call.match.length > 0 && <span className="font-medium text-violet-200">{t("calls.fits", { roles: call.match.join(", ") })}</span>}
        {call.budget && <span dir="auto">{call.budget}</span>}
        {call.deadline && <span>{t("calls.deadline", { date: formatCalendarDay(call.deadline) })}</span>}
        {answered && <span className="font-medium text-white/80">{t("calls.youApplied")}: {t(STATUS[answered])}</span>}
        {call.mine && call.applicantCount !== undefined && (
          <span>
            {t("calls.answers", { n: call.applicantCount })}
            {call.waitingCount ? ` · ${t("calls.waiting", { n: call.waitingCount })}` : ""}
          </span>
        )}
      </div>
    </article>
  );
}
