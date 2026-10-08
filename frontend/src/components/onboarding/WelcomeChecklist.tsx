import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onboardingApi } from "../../api/onboarding.api";
import { useAuth } from "../../context/AuthContext";
import type { OnboardingState, OnboardingStepKey } from "../../types";
import { t } from "../../i18n";

interface StepInfo {
  label: string;
  /** Where to go to do it; a step with no address does something on this page instead. */
  to?: string;
}

function stepInfo(key: OnboardingStepKey, username: string): StepInfo {
  switch (key) {
    case "email":
      return { label: t("welcome.step.email"), to: `/u/${username}?edit=1` };
    case "avatar":
      return { label: t("welcome.step.avatar"), to: `/u/${username}?edit=1` };
    case "bio":
      return { label: t("welcome.step.bio"), to: `/u/${username}?edit=1` };
    case "portfolio":
      return { label: t("welcome.step.portfolio"), to: `/u/${username}` };
    case "friend":
      return { label: t("welcome.step.friend"), to: "/search" };
    case "post":
      return { label: t("welcome.step.post") };
  }
}

const focusComposer = () => document.getElementById("post-composer")?.focus();

/** A getting-started checklist for new accounts, at the top of the feed. Each step is ticked from what the person has really done. */
export function WelcomeChecklist() {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onboardingApi
      .get()
      .then((s) => !cancelled && setState(s))
      .catch(() => {}); // no checklist is better than an error on the feed
    return () => {
      cancelled = true;
    };
  }, []);

  async function hide() {
    setError(false);
    try {
      await onboardingApi.dismiss();
      setState((s) => (s ? { ...s, dismissed: true, show: false } : s));
    } catch {
      setError(true);
    }
  }

  if (!state?.show || !user) return null;
  const done = state.steps.filter((s) => s.done).length;

  return (
    <section aria-label={t("welcome.region")} className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{t("welcome.title", { name: user.displayName.split(" ")[0] })}</h2>
          <p className="mt-0.5 text-sm text-white/70">{t("welcome.intro")}</p>
        </div>
        <button type="button" onClick={hide} className="shrink-0 rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10">
          {t("welcome.hide")}
        </button>
      </div>
      <div className="mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={state.steps.length} aria-valuenow={done} aria-label={t("welcome.progressAria", { done, total: state.steps.length })}>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-violet-400" style={{ width: `${(done / state.steps.length) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-white/60">
          {t("welcome.progress", { done, total: state.steps.length })}
        </p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {state.steps.map((step) => {
          const info = stepInfo(step.key, user.username);
          return (
            <li key={step.key} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${step.done ? "border-emerald-400 bg-emerald-400/20 text-emerald-300" : "border-white/30 text-transparent"}`}>
                ✓
              </span>
              {step.done ? (
                <span className="text-white/60">
                  {info.label} <span className="sr-only">{t("welcome.stepDone")}</span>
                </span>
              ) : info.to ? (
                <Link to={info.to} className="text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">
                  {info.label}
                </Link>
              ) : (
                <button type="button" onClick={focusComposer} className="text-start text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">
                  {info.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {t("welcome.hideFailed")}
        </p>
      )}
    </section>
  );
}
