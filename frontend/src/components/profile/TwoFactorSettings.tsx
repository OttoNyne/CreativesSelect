import { useState } from "react";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { groupKey } from "../../lib/twoFactor";
import { qrCodeFor } from "../../lib/share";
import { t } from "../../i18n";

type View =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "off" }
  | { kind: "password" } // asking for the password before a new secret is made
  | { kind: "scan"; secret: string; qr: string | null }
  | { kind: "codes"; codes: string[]; justTurnedOn: boolean } // the recovery codes, shown once
  | { kind: "on"; left: number }
  | { kind: "confirm"; action: "disable" | "new-codes"; left: number };

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";
const button = "rounded-md border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50";
const primary = "rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50";

/** Two-step sign-in in the owner's own settings: turn it on with an authenticator app, keep recovery codes, turn it off. Looked up only when opened. */
export function TwoFactorSettings() {
  const [view, setView] = useState<View>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const fail = (err: unknown, fallback: string) => setError(err instanceof ApiError ? err.message : fallback);
  function go(next: View) {
    setView(next);
    setError(null);
    setPassword("");
    setCode("");
    setSaved(false);
    setCopied(false);
  }

  async function open() {
    go({ kind: "loading" });
    try {
      const status = await authApi.twoFactorStatus();
      go(status.enabled ? { kind: "on", left: status.recoveryCodesLeft } : { kind: "off" });
    } catch (err) {
      go({ kind: "error", message: err instanceof ApiError ? err.message : t("settings.couldntLoadThisTry") });
    }
  }

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { secret, otpauthUrl } = await authApi.twoFactorSetup(password);
      // The picture is a convenience: if it can't be made, the key can still be typed in.
      const qr = await qrCodeFor(otpauthUrl).catch(() => null);
      go({ kind: "scan", secret, qr });
    } catch (err) {
      fail(err, t("settings.tfaStartFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { recoveryCodes } = await authApi.twoFactorEnable(code);
      go({ kind: "codes", codes: recoveryCodes, justTurnedOn: true });
    } catch (err) {
      fail(err, t("settings.tfaEnableFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction(e: React.FormEvent) {
    e.preventDefault();
    if (view.kind !== "confirm" || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (view.action === "disable") {
        await authApi.twoFactorDisable(password, code);
        go({ kind: "off" });
      } else {
        const { recoveryCodes } = await authApi.twoFactorNewRecoveryCodes(password, code);
        go({ kind: "codes", codes: recoveryCodes, justTurnedOn: false });
      }
    } catch (err) {
      fail(err, t("settings.tfaFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copy(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setError(t("settings.couldntCopyThemWrite"));
    }
  }

  function download(codes: string[]) {
    const text = `${t("settings.recoveryFileTitle")}\n${t("settings.recoveryFileNote")}\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "creativesselect-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (view.kind === "closed") {
    return (
      <button type="button" onClick={open} className="block text-xs text-white/60 hover:text-white">
        {t("settings.twoStepSignIn")}
      </button>
    );
  }

  const errorLine = error && (
    <p role="alert" className="text-xs text-red-400">
      {error}
    </p>
  );
  const close = (
    <button type="button" onClick={() => go({ kind: "closed" })} className="text-xs text-white/60 hover:text-white">
      {t("common.close")}
    </button>
  );

  return (
    <section aria-label={t("login.twoStep.title")} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("login.twoStep.title")}</h3>

      {view.kind === "loading" && <p className="text-xs text-white/60">{t("common.loading")}</p>}

      {view.kind === "error" && (
        <>
          <p role="alert" className="text-xs text-red-400">
            {view.message}
          </p>
          <button type="button" onClick={open} className={button}>
            {t("common.tryAgain")}
          </button>
        </>
      )}

      {view.kind === "off" && (
        <>
          <p className="text-xs text-white/60">
            {t("settings.addASecondStep")}
          </p>
          <button type="button" onClick={() => go({ kind: "password" })} className={button}>
            {t("settings.turnOnTwoStep")}
          </button>
        </>
      )}

      {view.kind === "password" && (
        <form onSubmit={startSetup} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/70">{t("settings.enterYourPasswordTo3")}</p>
          <input type="password" autoComplete="current-password" placeholder={t("settings.yourPassword")} aria-label={t("settings.yourPassword")} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={!password || busy} className={primary}>
              {busy ? t("settings.starting") : t("common.continue")}
            </button>
            <button type="button" onClick={() => go({ kind: "off" })} className={button}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {view.kind === "scan" && (
        <form onSubmit={confirmSetup} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/70">{t("settings.1InYourAuthenticator")}</p>
          {view.qr && (
            <img src={view.qr} alt={t("settings.qrCodeToScan")} width={160} height={160} className="rounded bg-white p-1" />
          )}
          <p className="text-xs text-white/70">{t("settings.cantScanItChoose")}</p>
          <p className="select-all font-mono text-sm tracking-wider text-white" aria-label={t("settings.setupKey")}>
            {groupKey(view.secret)}
          </p>
          <p className="text-xs text-white/70">{t("settings.2EnterThe6")}</p>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder={t("settings.6DigitCode")} aria-label={t("settings.6DigitCode")} maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} className={field} />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={!code.trim() || busy} className={primary}>
              {busy ? t("common.checking") : t("settings.turnOn")}
            </button>
            <button type="button" onClick={() => go({ kind: "off" })} className={button}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {view.kind === "codes" && (
        <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-emerald-400">{view.justTurnedOn ? t("settings.twoStepSignIn2") : t("settings.hereAreYourNew")}</p>
          <p className="text-xs text-white/70">
            {t("settings.saveTheseRecoveryCodes")}
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm text-white" aria-label={t("settings.recoveryCodes")}>
            {view.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(view.codes)} className={button}>
              {copied ? t("settings.copied") : t("settings.copyCodes")}
            </button>
            <button type="button" onClick={() => download(view.codes)} className={button}>
              {t("settings.download")}
            </button>
          </div>
          {errorLine}
          <label className="flex items-center gap-2 text-xs text-white/80">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            {t("settings.iveSavedTheseCodes")}
          </label>
          <button type="button" disabled={!saved} onClick={() => go({ kind: "on", left: view.codes.length })} className={primary}>
            {t("settings.done")}
          </button>
        </div>
      )}

      {view.kind === "on" && (
        <>
          <p className="text-xs text-emerald-400">{t("settings.twoStepSignIn2")}</p>
          <p className={`text-xs ${view.left <= 2 ? "text-amber-300" : "text-white/60"}`}>
            {view.left === 0 ? t("settings.youHaveNoRecovery") : t("settings.recoveryLeft", { n: view.left })}
            {view.left <= 2 && ` ${t("settings.recoveryGetNew")}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => go({ kind: "confirm", action: "new-codes", left: view.left })} className={button}>
              {t("settings.getNewRecoveryCodes")}
            </button>
            <button type="button" onClick={() => go({ kind: "confirm", action: "disable", left: view.left })} className={button}>
              {t("settings.turnOff")}
            </button>
          </div>
        </>
      )}

      {view.kind === "confirm" && (
        <form onSubmit={confirmAction} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/70">
            {view.action === "disable" ? t("settings.toTurnItOff") : t("settings.toGetNewRecovery")}
          </p>
          <input type="password" autoComplete="current-password" placeholder={t("settings.yourPassword")} aria-label={t("settings.yourPassword")} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          <input autoComplete="one-time-code" placeholder={t("login.twoStep.label")} aria-label={t("login.twoStep.label")} maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} className={field} />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={!password || !code.trim() || busy} className={primary}>
              {busy ? t("common.checking") : view.action === "disable" ? t("settings.turnOff") : t("settings.getNewCodes")}
            </button>
            <button type="button" onClick={() => go({ kind: "on", left: view.left })} className={button}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {view.kind !== "codes" && view.kind !== "loading" && close}
    </section>
  );
}
