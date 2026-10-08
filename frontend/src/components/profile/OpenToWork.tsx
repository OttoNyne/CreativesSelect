import { useState } from "react";
import { ApiError } from "../../api/client";
import { workRequestsApi, MAX_BUDGET, MAX_DETAILS, MAX_OFFERS, MAX_TITLE, MAX_WORK_NOTE } from "../../api/workRequests.api";
import { isValidTag, normalizeTag } from "../../lib/tags";
import { t } from "../../i18n";
import type { User } from "../../types";

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:outline-none focus:border-[var(--profile-accent,#8b5cf6)]";

/** Under someone's name: that they are open to work, what they offer, and their note. Nothing when they aren't. */
export function OpenToWorkBadge({ profile }: { profile: Pick<User, "openToWork" | "workOffers" | "workNote"> }) {
  if (!profile.openToWork) return null;
  const offers = profile.workOffers ?? [];
  return (
    <div className="mt-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {t("work.openToWork")}
      </span>
      {offers.length > 0 && (
        <ul aria-label={t("work.theyOffer")} className="mt-1.5 flex flex-wrap gap-1.5">
          {offers.map((o) => (
            <li key={o} className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-[var(--profile-muted)]">
              {o}
            </li>
          ))}
        </ul>
      )}
      {profile.workNote && (
        <p dir="auto" className="mt-1 text-xs text-[var(--profile-muted)]">
          {profile.workNote}
        </p>
      )}
    </div>
  );
}

/** The owner's side: what they offer (up to five words) and a short note. The "open to work" switch itself is saved straight away elsewhere. */
export function OffersEditor({ offers, note, onOffers, onNote }: { offers: string[]; note: string; onOffers: (offers: string[]) => void; onNote: (note: string) => void }) {
  const [draft, setDraft] = useState("");
  const problem = draft.trim() && (!isValidTag(normalizeTag(draft)) || offers.includes(normalizeTag(draft))) ? t("work.offerProblem") : null;

  function add(raw: string) {
    const offer = normalizeTag(raw);
    if (!offer || !isValidTag(offer) || offers.includes(offer) || offers.length >= MAX_OFFERS) return;
    onOffers([...offers, offer]);
    setDraft("");
  }

  return (
    <div className="space-y-2 text-xs text-white/70">
      <div>
        <label htmlFor="work-offer-input">{t("work.whatYouOffer", { n: offers.length, max: MAX_OFFERS })}</label>
        <ul aria-label={t("work.yourOffers")} className="mt-1 flex flex-wrap gap-1.5">
          {offers.map((o) => (
            <li key={o} className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 py-0.5 ps-2.5 pe-1 text-xs text-white">
              {o}
              <button type="button" onClick={() => onOffers(offers.filter((x) => x !== o))} aria-label={t("work.removeOffer", { offer: o })} className="rounded-full px-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                ✕
              </button>
            </li>
          ))}
        </ul>
        {offers.length < MAX_OFFERS && (
          <div className="mt-1.5 flex gap-1.5">
            <input
              id="work-offer-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(draft);
                }
              }}
              maxLength={40}
              placeholder={t("work.offerPlaceholder")}
              aria-invalid={problem ? true : undefined}
              className={field}
            />
            <button type="button" onClick={() => add(draft)} disabled={!draft.trim() || Boolean(problem)} className="shrink-0 rounded-md border border-white/20 px-3 text-xs text-white hover:bg-white/10 disabled:opacity-50">
              {t("work.addOffer")}
            </button>
          </div>
        )}
        {problem && <p className="mt-1 text-amber-300">{problem}</p>}
      </div>
      <label className="block">
        {t("work.note")}
        <input value={note} onChange={(e) => onNote(e.target.value)} maxLength={MAX_WORK_NOTE} dir="auto" placeholder={t("work.notePlaceholder")} className={`${field} mt-1`} />
      </label>
    </div>
  );
}

/** The form a visitor fills in to ask someone for work: a title, what they need, an optional budget hint and deadline. */
export function WorkRequestForm({ to, onSent, onCancel }: { to: Pick<User, "username" | "displayName">; onSent: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !details.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      await workRequestsApi.send(to.username, { title: title.trim(), details: details.trim(), ...(budget.trim() ? { budget: budget.trim() } : {}), ...(deadline ? { deadline } : {}) });
      onSent();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("work.couldntSend"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={t("work.requestFrom", { name: to.displayName })} className="mt-3 space-y-2 rounded-lg border border-white/15 bg-black/30 p-3 text-sm text-white">
      <h3 className="text-sm font-semibold">{t("work.requestFrom", { name: to.displayName })}</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} dir="auto" placeholder={t("work.titlePlaceholder")} aria-label={t("work.titleLabel")} className={field} />
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={MAX_DETAILS} rows={4} dir="auto" placeholder={t("work.detailsPlaceholder")} aria-label={t("work.detailsLabel")} className={field} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={budget} onChange={(e) => setBudget(e.target.value)} maxLength={MAX_BUDGET} dir="auto" placeholder={t("work.budgetPlaceholder")} aria-label={t("work.budgetLabel")} className={field} />
        <input type="date" value={deadline} min={today} onChange={(e) => setDeadline(e.target.value)} aria-label={t("work.deadlineLabel")} className={field} />
      </div>
      <p className="text-xs text-white/60">{t("work.noMoney")}</p>
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || !title.trim() || !details.trim()} className="rounded-md bg-[var(--profile-accent-fill,#7c3aed)] px-3 py-1.5 text-sm font-medium text-[var(--profile-on-accent,#fff)] disabled:opacity-50">
          {busy ? t("common.sending") : t("work.send")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-white/70 hover:underline disabled:opacity-50">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
