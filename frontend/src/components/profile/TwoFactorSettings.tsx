import { useState } from "react";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { groupKey } from "../../lib/twoFactor";
import { qrCodeFor } from "../../lib/share";

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
      go({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't load this, try again." });
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
      fail(err, "Couldn't start, try again.");
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
      fail(err, "Couldn't turn it on, try again.");
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
      fail(err, "Couldn't do that, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setError("Couldn't copy them — write them down or use Download instead.");
    }
  }

  function download(codes: string[]) {
    const text = `CreativesSelect recovery codes\nEach one works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
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
        Two-step sign-in…
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
      Close
    </button>
  );

  return (
    <section aria-label="Two-step sign-in" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">Two-step sign-in</h3>

      {view.kind === "loading" && <p className="text-xs text-white/60">Loading…</p>}

      {view.kind === "error" && (
        <>
          <p role="alert" className="text-xs text-red-400">
            {view.message}
          </p>
          <button type="button" onClick={open} className={button}>
            Try again
          </button>
        </>
      )}

      {view.kind === "off" && (
        <>
          <p className="text-xs text-white/60">
            Add a second step to logging in: after your password, a 6-digit code from an authenticator app on your phone (such as Google Authenticator, Microsoft Authenticator or 1Password). Someone who learns your password still can&apos;t get in.
          </p>
          <button type="button" onClick={() => go({ kind: "password" })} className={button}>
            Turn on two-step sign-in
          </button>
        </>
      )}

      {view.kind === "password" && (
        <form onSubmit={startSetup} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/70">Enter your password to start.</p>
          <input type="password" autoComplete="current-password" placeholder="Your password" aria-label="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={!password || busy} className={primary}>
              {busy ? "Starting…" : "Continue"}
            </button>
            <button type="button" onClick={() => go({ kind: "off" })} className={button}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {view.kind === "scan" && (
        <form onSubmit={confirmSetup} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/70">1. In your authenticator app, add an account by scanning this picture.</p>
          {view.qr && (
            <img src={view.qr} alt="QR code to scan with your authenticator app" width={160} height={160} className="rounded bg-white p-1" />
          )}
          <p className="text-xs text-white/70">Can&apos;t scan it? Choose &quot;enter a setup key&quot; in the app and type this key:</p>
          <p className="select-all font-mono text-sm tracking-wider text-white" aria-label="Setup key">
            {groupKey(view.secret)}
          </p>
          <p className="text-xs text-white/70">2. Enter the 6-digit code the app now shows.</p>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="6-digit code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} className={field} />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={!code.trim() || busy} className={primary}>
              {busy ? "Checking…" : "Turn on"}
            </button>
            <button type="button" onClick={() => go({ kind: "off" })} className={button}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {view.kind === "codes" && (
        <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-emerald-400">{view.justTurnedOn ? "Two-step sign-in is on." : "Here are your new recovery codes. The old ones no longer work."}</p>
          <p className="text-xs text-white/70">
            Save these recovery codes now. If you lose your phone, each one lets you in once. They won&apos;t be shown again.
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm text-white" aria-label="Recovery codes">
            {view.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(view.codes)} className={button}>
              {copied ? "Copied ✓" : "Copy codes"}
            </button>
            <button type="button" onClick={() => download(view.codes)} className={button}>
              Download
            </button>
          </div>
          {errorLine}
          <label className="flex items-center gap-2 text-xs text-white/80">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            I&apos;ve saved these codes somewhere safe
          </label>
          <button type="button" disabled={!saved} onClick={() => go({ kind: "on", left: view.codes.length })} className={primary}>
            Done
          </button>
        </div>
      )}

      {view.kind === "on" && (
        <>
          <p className="text-xs text-emerald-400">Two-step sign-in is on.</p>
          <p className={`text-xs ${view.left <= 2 ? "text-amber-300" : "text-white/60"}`}>
            {view.left === 0 ? "You have no recovery codes left." : `You have ${view.left} recovery code${view.left === 1 ? "" : "s"} left.`}
            {view.left <= 2 && " Get new ones before you run out."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => go({ kind: "confirm", action: "new-codes", left: view.left })} className={button}>
              Get new recovery codes
            </button>
            <button type="button" onClick={() => go({ kind: "confirm", action: "disable", left: view.left })} className={button}>
              Turn off
            </button>
          </div>
        </>
      )}

      {view.kind === "confirm" && (
        <form onSubmit={confirmAction} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/70">
            {view.action === "disable" ? "To turn it off, enter your password and a code from your app (or a recovery code)." : "To get new recovery codes, enter your password and a code from your app (or a recovery code). The old codes will stop working."}
          </p>
          <input type="password" autoComplete="current-password" placeholder="Your password" aria-label="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          <input autoComplete="one-time-code" placeholder="Code from your app" aria-label="Code from your app" maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} className={field} />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={!password || !code.trim() || busy} className={primary}>
              {busy ? "Checking…" : view.action === "disable" ? "Turn off" : "Get new codes"}
            </button>
            <button type="button" onClick={() => go({ kind: "on", left: view.left })} className={button}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {view.kind !== "codes" && view.kind !== "loading" && close}
    </section>
  );
}
