import { useState } from "react";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { t } from "../../i18n";

/**
 * "Change email" in the owner's own settings. The new address has to be proved (a link goes to it) before anything changes, so this
 * only asks; and with two-step sign-in on, the server asks for a code too, which this then shows a box for.
 */
export function ChangeEmail() {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setNewEmail("");
    setPassword("");
    setCode("");
    setNeedsCode(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const wanted = newEmail.trim();
      await authApi.requestEmailChange(wanted, password, needsCode ? code : undefined);
      close();
      setSentTo(wanted);
    } catch (err) {
      if (err instanceof ApiError && err.code === "second_step_needed") {
        setNeedsCode(true);
        setError(code ? err.message : t("settings.enterACodeFrom"));
        setCode("");
      } else {
        setError(err instanceof ApiError ? err.message : t("settings.couldntAskForThe"));
      }
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setOpen(true);
          }}
          className="block text-xs text-white/60 hover:text-white"
        >
          {t("settings.changeEmail")}
        </button>
        {sentTo && (
          <p role="status" className="text-xs text-emerald-400">
            {t("settings.emailLinkSent", { email: sentTo })}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} aria-label={t("settings.changeEmail2")} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-white/70">{t("settings.wellSendALink")}</p>
      <input type="email" autoComplete="email" placeholder={t("settings.newEmailAddress")} aria-label={t("settings.newEmailAddress")} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={field} />
      <input type="password" autoComplete="current-password" placeholder={t("settings.yourPassword")} aria-label={t("settings.yourPassword")} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
      {needsCode && (
        <input autoComplete="one-time-code" placeholder={t("login.twoStep.label")} aria-label={t("login.twoStep.label")} maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} className={field} />
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!newEmail.trim() || !password || (needsCode && !code.trim()) || busy}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? t("common.sending") : t("settings.sendTheLink")}
        </button>
        <button type="button" onClick={close} className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
