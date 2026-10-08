import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, MAX_NOTE, type ModerationDecision, type VerifiedPerson } from "../api/admin.api";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import { useAuth } from "../context/AuthContext";
import { formatDay } from "../lib/when";
import { CSBadge } from "../components/common/CSBadge";
import type { AdminAction, ModerationCase, SuspendedAccount } from "../types";
import { t, type Key } from "../i18n";

type Tab = "open" | "handled" | "suspended" | "verified";

const TYPE_KEY: Record<string, Key> = {
  user: "misc.type.account",
  post: "misc.type.post",
  comment: "misc.type.comment",
  profileComment: "misc.type.testimonial",
  blogEntry: "misc.type.blogEntry",
  bulletin: "misc.type.bulletin",
  groupTopic: "misc.type.groupTopic",
  groupReply: "misc.type.groupReply",
  mediaComment: "misc.type.mediaComment",
  event: "misc.type.event",
  blogComment: "misc.type.blogComment",
};
const typeLabel = (type: string): string => (TYPE_KEY[type] ? t(TYPE_KEY[type]) : type);
const ACTION_KEY: Record<string, Key> = {
  dismissed: "misc.action.dismissed",
  removed: "misc.action.removed",
  suspended: "misc.action.suspended",
  removed_and_suspended: "misc.action.removedSuspended",
  unsuspended: "misc.action.lifted",
  verified: "misc.action.badgeGiven",
  unverified: "misc.action.badgeRemoved",
};

const button = "rounded-md border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50";
const danger = "rounded-md border border-red-400/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50";

function CaseCard({ item, onDone }: { item: ModerationCase; onDone: (item: ModerationCase) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAccount = item.targetType === "user";
  const hasAuthor = Boolean(item.target?.author);

  async function decide(action: ModerationDecision, ask?: string) {
    if (ask && !window.confirm(ask)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.resolve(item.targetType, item.targetId, action, note.trim() || undefined);
      onDone(item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("misc.couldntSaveThatDecision"));
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">{typeLabel(item.targetType)}</span>
        <span>
          {item.count} {item.count === 1 ? t("misc.report") : t("misc.reports")}
        </span>
        {!item.exists && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-200">{t("misc.alreadyDeleted")}</span>}
      </div>

      {item.target ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          {item.target.author && (
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Avatar username={item.target.author.username} displayName={item.target.author.displayName} avatarUrl={item.target.author.avatarUrl} size={24} />
              <Link to={`/u/${item.target.author.username}`} className="font-medium hover:underline">
                {item.target.author.displayName}
              </Link>
              <span className="text-white/60">@{item.target.author.username}</span>
            </div>
          )}
          {item.target.title && <p className="mt-2 font-medium text-white">{item.target.title}</p>}
          {item.target.text && <p className="mt-1 whitespace-pre-line break-words text-sm text-white/85">{item.target.text}</p>}
          {item.target.image && <p className="mt-1 break-all text-xs text-white/60">{t("misc.picture")} {item.target.image}</p>}
          {item.target.link && (
            <Link to={item.target.link} className="mt-2 inline-block text-xs text-violet-300 hover:underline">
              {t("misc.openItYouSee")}
            </Link>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-white/60">{t("misc.theReportedContentIs")}</p>
      )}

      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">{t("misc.whyItWasReported")}</h3>
      <ul className="mt-1 space-y-1">
        {item.reports.map((r) => (
          <li key={r.id} className="text-sm text-white/80">
            <span dir="auto">{t("misc.reportedBy", { reason: r.reason, name: r.reporter?.displayName ?? t("misc.someone"), day: formatDay(r.createdAt) })}</span>
          </li>
        ))}
        {item.count > item.reports.length && <li className="text-xs text-white/60">{t("misc.andMoreReports", { n: item.count - item.reports.length })}</li>}
      </ul>

      <label className="mt-3 block text-xs text-white/70">
        {t("misc.noteForTheRecord")}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} rows={2} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => decide("dismiss")} className={button}>
          {t("common.dismiss")}
        </button>
        {!isAccount && item.exists && (
          <button type="button" disabled={busy} onClick={() => decide("remove", t("misc.removeThisContentThe"))} className={danger}>
            {t("misc.removeContent")}
          </button>
        )}
        {hasAuthor && (
          <button type="button" disabled={busy} onClick={() => decide("suspend", t("misc.suspendConfirm", { name: item.target?.author?.displayName ?? "" }))} className={danger}>
            {t("misc.suspend")} {isAccount ? t("misc.account") : t("misc.author")}
          </button>
        )}
        {hasAuthor && !isAccount && item.exists && (
          <button type="button" disabled={busy} onClick={() => decide("remove_and_suspend", `Remove this content and suspend ${item.target?.author?.displayName}?`)} className={danger}>
            {t("misc.removeAndSuspend")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

/** The moderation review queue, for administrators. Everyone else is told there is nothing here. */
export function ModerationPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("open");
  const [cases, setCases] = useState<ModerationCase[]>([]);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [suspended, setSuspended] = useState<SuspendedAccount[]>([]);
  const [verified, setVerified] = useState<VerifiedPerson[]>([]);
  const [badgeName, setBadgeName] = useState("");
  const [badgeMessage, setBadgeMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: Tab, p: number) => {
    setState("loading");
    try {
      if (which === "open") {
        const res = await adminApi.reports(p);
        setCases((old) => (p === 1 ? res.cases : [...old, ...res.cases]));
        setHasMore(res.hasMore);
      } else if (which === "handled") {
        const res = await adminApi.actions(p);
        setActions((old) => (p === 1 ? res.actions : [...old, ...res.actions]));
        setHasMore(res.hasMore);
      } else if (which === "verified") {
        const res = await adminApi.verified(p);
        setVerified((old) => (p === 1 ? res.users : [...old, ...res.users]));
        setHasMore(res.hasMore);
      } else {
        const res = await adminApi.suspended(p);
        setSuspended((old) => (p === 1 ? res.users : [...old, ...res.users]));
        setHasMore(res.hasMore);
      }
      setPage(p);
      setState("ready");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "notfound" : t("misc.couldntLoadThis"));
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) load(tab, 1);
  }, [tab, user?.isAdmin, load]);

  if (!user?.isAdmin || error === "notfound") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-white/70">
        <p role="alert">{t("misc.theresNothingHere")}</p>
      </div>
    );
  }

  async function lift(account: SuspendedAccount) {
    if (!window.confirm(t("misc.letBackIn", { name: account.user.displayName }))) return;
    try {
      await adminApi.unsuspend(account.user.id);
      setSuspended((old) => old.filter((s) => s.user.id !== account.user.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("misc.couldntLiftThatSuspension"));
    }
  }

  async function giveBadge(e: React.FormEvent) {
    e.preventDefault();
    const username = badgeName.trim().replace(/^@/, "");
    if (!username) return;
    setBadgeMessage(null);
    try {
      const { given, user: person } = await adminApi.giveBadge(username);
      setBadgeMessage({ text: given ? t("misc.nowHasBadge", { name: person.displayName }) : t("misc.alreadyHasBadge", { name: person.displayName }), error: false });
      setBadgeName("");
      load("verified", 1);
    } catch (err) {
      setBadgeMessage({ text: err instanceof ApiError ? err.message : t("misc.couldntGiveTheBadge"), error: true });
    }
  }

  async function removeBadge(person: VerifiedPerson) {
    if (!window.confirm(t("misc.removeBadgeConfirm", { name: person.user.displayName }))) return;
    try {
      await adminApi.removeBadge(person.user.username);
      setVerified((old) => old.filter((v) => v.user.id !== person.user.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("misc.couldntTakeTheBadge"));
    }
  }

  const tabButton = (which: Tab, label: string) => (
    <button type="button" onClick={() => setTab(which)} aria-pressed={tab === which} className={`rounded-full border px-3 py-1 text-sm ${tab === which ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/80 hover:bg-white/10"}`}>
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{t("nav.moderation")}</h1>
        <p className="text-sm text-white/60">{t("misc.reportsFromMembersGrouped")}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("misc.moderationViews")}>
        {tabButton("open", t("misc.openReports"))}
        {tabButton("handled", t("misc.handled"))}
        {tabButton("suspended", t("misc.suspendedAccounts"))}
        {tabButton("verified", "CSverified")}
      </div>

      {state === "loading" && page === 1 && <p className="p-6 text-center text-white/60">{t("common.loading")}</p>}
      {state === "error" && error !== "notfound" && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {tab === "open" && state === "ready" && cases.length === 0 && <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/60">{t("misc.nothingWaitingAllReports")}</p>}
      {tab === "open" && (
        <ul className="space-y-3">
          {cases.map((c) => (
            <CaseCard key={`${c.targetType}:${c.targetId}`} item={c} onDone={(done) => setCases((old) => old.filter((x) => !(x.targetType === done.targetType && x.targetId === done.targetId)))} />
          ))}
        </ul>
      )}

      {tab === "handled" && state === "ready" && actions.length === 0 && <p className="text-sm text-white/60">{t("misc.noDecisionsYet")}</p>}
      {tab === "handled" && (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
              <span className="font-medium text-white">{ACTION_KEY[a.action] ? t(ACTION_KEY[a.action]) : a.action}</span> · {typeLabel(a.targetType)}
              {a.reportCount > 0 && ` · ${t("misc.reportCount", { n: a.reportCount })}`}
              <div className="mt-0.5 text-xs text-white/60">
                {a.subject ? `${t("misc.aboutSubject", { name: a.subject.displayName })} ` : ""}{t("misc.byAdmin", { name: a.admin?.displayName ?? t("misc.aModerator"), day: formatDay(a.createdAt) })}
              </div>
              {a.note && <p className="mt-1 whitespace-pre-line text-xs text-white/70">{t("misc.note")} {a.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {tab === "verified" && (
        <section aria-label={t("misc.csverifiedBadges")} className="space-y-3">
          <p className="text-sm text-white/60">
            {t("misc.theBadgeIsAlso")}
          </p>
          <form onSubmit={giveBadge} className="flex gap-2">
            <input value={badgeName} onChange={(e) => setBadgeName(e.target.value)} placeholder={t("register.username")} aria-label={t("misc.usernameToGiveThe")} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none" />
            <button type="submit" disabled={!badgeName.trim()} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {t("misc.giveBadge")}
            </button>
          </form>
          {badgeMessage && (
            <p role={badgeMessage.error ? "alert" : "status"} className={`text-sm ${badgeMessage.error ? "text-red-400" : "text-emerald-300"}`}>
              {badgeMessage.text}
            </p>
          )}
          {state === "ready" && verified.length === 0 && <p className="text-sm text-white/60">{t("misc.youHaventGivenThe")}</p>}
          <ul className="space-y-2">
            {verified.map((v) => (
              <li key={v.user.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <Avatar username={v.user.username} displayName={v.user.displayName} avatarUrl={v.user.avatarUrl} size={32} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-white">
                    <Link to={`/u/${v.user.username}`} className="hover:underline">
                      {v.user.displayName}
                    </Link>
                    <CSBadge verified size={14} className="ms-1" /> <span className="font-normal text-white/60">@{v.user.username}</span>
                  </p>
                  <p className="text-xs text-white/60">{t("misc.given", { day: formatDay(v.givenAt) })}</p>
                </div>
                <button type="button" onClick={() => removeBadge(v)} className={button}>
                  {t("misc.removeBadge")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "suspended" && state === "ready" && suspended.length === 0 && <p className="text-sm text-white/60">{t("misc.noAccountsAreSuspended")}</p>}
      {tab === "suspended" && (
        <ul className="space-y-2">
          {suspended.map((s) => (
            <li key={s.user.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <Avatar username={s.user.username} displayName={s.user.displayName} avatarUrl={s.user.avatarUrl} size={32} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-white">
                  {s.user.displayName} <span className="font-normal text-white/60">@{s.user.username}</span>
                </p>
                <p className="text-xs text-white/60">
                  {t("misc.suspendedOn", { day: formatDay(s.suspendedAt) })}
                  {s.note ? ` · ${s.note}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => lift(s)} className={button}>
                {t("misc.liftSuspension")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state === "ready" && hasMore && (
        <button type="button" onClick={() => load(tab, page + 1)} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10">
          {t("events.showMore")}
        </button>
      )}
    </div>
  );
}
