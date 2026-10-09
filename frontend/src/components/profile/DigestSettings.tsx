import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { digestApi } from "../../api/topics.api";
import { t } from "../../i18n";

/** In the owner's settings: the weekly summary email, off until they turn it on. */
export function DigestSettings() {
  const [state, setState] = useState<{ enabled: boolean; emailVerified: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    digestApi
      .get()
      .then((r) => live && setState(r))
      .catch((err) => live && setProblem(err instanceof ApiError ? err.message : t("digest.failed")));
    return () => {
      live = false;
    };
  }, []);

  async function change(enabled: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      setState(await digestApi.set(enabled));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("digest.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("digest.title")} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("digest.title")}</h3>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input type="checkbox" checked={state?.enabled === true} disabled={!state || busy} onChange={(e) => change(e.target.checked)} />
        {t("digest.label")}
      </label>
      <p className="text-xs text-white/60">{t("digest.help")}</p>
      {state && state.enabled && !state.emailVerified && <p className="text-xs text-amber-300">{t("digest.unconfirmed")}</p>}
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}
