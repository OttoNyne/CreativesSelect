import { useState } from "react";
import { authApi, type SignedInDevice } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { agoText } from "../../lib/when";

type State = { kind: "closed" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "loaded"; devices: SignedInDevice[]; alerts: boolean };

/** Where the owner is signed in, with a way to end any one of them or all the others, in their own settings. Looked up only when opened. */
export function SignedInDevices() {
  const [state, setState] = useState<State>({ kind: "closed" });
  const [busy, setBusy] = useState<string | null>(null); // the id being ended, or "others"
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function load() {
    setState({ kind: "loading" });
    try {
      const { sessions, signInAlerts } = await authApi.sessions();
      setState({ kind: "loaded", devices: sessions, alerts: signInAlerts });
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't load your devices, try again." });
    }
  }

  async function endOne(device: SignedInDevice) {
    if (state.kind !== "loaded" || busy) return;
    setBusy(device.id);
    setMessage(null);
    try {
      await authApi.endSession(device.id);
      setState({ ...state, devices: state.devices.filter((d) => d.id !== device.id) });
      setMessage({ text: `${device.device} was signed out.`, error: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already gone (ended somewhere else, or it expired): the list is simply out of date.
        await load();
      } else {
        setMessage({ text: err instanceof ApiError ? err.message : "Couldn't sign that device out.", error: true });
      }
    } finally {
      setBusy(null);
    }
  }

  async function changeAlerts(enabled: boolean) {
    if (state.kind !== "loaded") return;
    const before = state;
    setState({ ...state, alerts: enabled });
    setMessage(null);
    try {
      await authApi.setSignInAlerts(enabled);
    } catch (err) {
      setState(before);
      setMessage({ text: err instanceof ApiError ? err.message : "Couldn't save that change.", error: true });
    }
  }

  async function endOthers() {
    if (state.kind !== "loaded" || busy) return;
    setBusy("others");
    setMessage(null);
    try {
      const { ended } = await authApi.endOtherSessions();
      setState({ ...state, devices: state.devices.filter((d) => d.current) });
      setMessage({ text: ended === 0 ? "There were no other devices signed in." : `Signed out ${ended} other device${ended === 1 ? "" : "s"}.`, error: false });
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : "Couldn't sign the other devices out.", error: true });
    } finally {
      setBusy(null);
    }
  }

  const button = "rounded-md border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50";
  if (state.kind === "closed") {
    return (
      <button type="button" onClick={load} className="block text-xs text-white/60 hover:text-white">
        Where you&apos;re signed in…
      </button>
    );
  }

  const others = state.kind === "loaded" ? state.devices.filter((d) => !d.current) : [];
  return (
    <section aria-label="Where you're signed in" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">Where you&apos;re signed in</h3>
      {state.kind === "loading" && <p className="text-xs text-white/60">Loading…</p>}
      {state.kind === "error" && (
        <>
          <p role="alert" className="text-xs text-red-400">
            {state.message}
          </p>
          <button type="button" onClick={load} className={button}>
            Try again
          </button>
        </>
      )}
      {state.kind === "loaded" && (
        <>
          <p className="text-xs text-white/60">Each browser or phone you&apos;ve signed in on. If you don&apos;t recognise one, sign it out, then change your password.</p>
          <ul className="space-y-1.5">
            {state.devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                <span className="min-w-0 text-xs text-white/85">
                  <span className="block truncate font-medium">
                    {d.device}
                    {d.current && <span className="ms-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-normal text-emerald-300">This device</span>}
                  </span>
                  <span className="block text-[11px] text-white/60">
                    {d.current ? "Using it now" : `Last used ${agoText(d.lastSeenAt)}`} · signed in {agoText(d.createdAt)}
                  </span>
                </span>
                {!d.current && (
                  <button type="button" onClick={() => endOne(d)} disabled={busy !== null} aria-label={`Sign out ${d.device}, last used ${agoText(d.lastSeenAt)}`} className={button}>
                    {busy === d.id ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <button type="button" onClick={endOthers} disabled={busy !== null} className={button}>
              {busy === "others" ? "Signing out…" : others.length === 1 ? "Sign out the other device" : `Sign out all ${others.length} other devices`}
            </button>
          )}
          {others.length === 0 && <p className="text-xs text-white/60">You&apos;re signed in on this device only.</p>}
          <label className="flex items-start gap-2 text-xs text-white/80">
            <input type="checkbox" checked={state.alerts} onChange={(e) => changeAlerts(e.target.checked)} className="mt-0.5" />
            <span>
              Email me when someone signs in from a browser or phone I haven&apos;t used before
              <span className="block text-[11px] text-white/60">It says which kind of device and when, never anything private.</span>
            </span>
          </label>
        </>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-xs ${message.error ? "text-red-400" : "text-emerald-400"}`}>
          {message.text}
        </p>
      )}
      <button type="button" onClick={() => setState({ kind: "closed" })} className="text-xs text-white/60 hover:text-white">
        Close
      </button>
    </section>
  );
}
