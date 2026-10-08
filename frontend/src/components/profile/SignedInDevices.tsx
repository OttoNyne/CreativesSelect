import { useState } from "react";
import { authApi, type SignedInDevice } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { agoText } from "../../lib/when";
import { t } from "../../i18n";

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
      setState({ kind: "error", message: err instanceof ApiError ? err.message : t("settings.couldntLoadYourDevices") });
    }
  }

  async function endOne(device: SignedInDevice) {
    if (state.kind !== "loaded" || busy) return;
    setBusy(device.id);
    setMessage(null);
    try {
      await authApi.endSession(device.id);
      setState({ ...state, devices: state.devices.filter((d) => d.id !== device.id) });
      setMessage({ text: t("settings.deviceSignedOut", { device: device.device }), error: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already gone (ended somewhere else, or it expired): the list is simply out of date.
        await load();
      } else {
        setMessage({ text: err instanceof ApiError ? err.message : t("settings.couldntSignThatDevice"), error: true });
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
      setMessage({ text: err instanceof ApiError ? err.message : t("common.saveChangeFailed"), error: true });
    }
  }

  async function endOthers() {
    if (state.kind !== "loaded" || busy) return;
    setBusy("others");
    setMessage(null);
    try {
      const { ended } = await authApi.endOtherSessions();
      setState({ ...state, devices: state.devices.filter((d) => d.current) });
      setMessage({ text: ended === 0 ? t("settings.noOtherDevices") : t("settings.otherDevicesSignedOut", { n: ended }), error: false });
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : t("settings.couldntSignTheOther"), error: true });
    } finally {
      setBusy(null);
    }
  }

  const button = "rounded-md border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50";
  if (state.kind === "closed") {
    return (
      <button type="button" onClick={load} className="block text-xs text-white/60 hover:text-white">
        {t("settings.whereYoureSignedIn")}
      </button>
    );
  }

  const others = state.kind === "loaded" ? state.devices.filter((d) => !d.current) : [];
  return (
    <section aria-label={t("settings.whereYoureSignedIn2")} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("settings.whereYoureSignedIn2")}</h3>
      {state.kind === "loading" && <p className="text-xs text-white/60">{t("common.loading")}</p>}
      {state.kind === "error" && (
        <>
          <p role="alert" className="text-xs text-red-400">
            {state.message}
          </p>
          <button type="button" onClick={load} className={button}>
            {t("common.tryAgain")}
          </button>
        </>
      )}
      {state.kind === "loaded" && (
        <>
          <p className="text-xs text-white/60">{t("settings.eachBrowserOrPhone")}</p>
          <ul className="space-y-1.5">
            {state.devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                <span className="min-w-0 text-xs text-white/85">
                  <span className="block truncate font-medium">
                    {d.device}
                    {d.current && <span className="ms-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-normal text-emerald-300">{t("settings.thisDevice")}</span>}
                  </span>
                  <span className="block text-[11px] text-white/60">
                    {t("settings.deviceMeta", { last: d.current ? t("settings.usingItNow") : t("settings.lastUsed", { ago: agoText(d.lastSeenAt) }), ago: agoText(d.createdAt) })}
                  </span>
                </span>
                {!d.current && (
                  <button type="button" onClick={() => endOne(d)} disabled={busy !== null} aria-label={t("settings.signOutAria", { device: d.device, ago: agoText(d.lastSeenAt) })} className={button}>
                    {busy === d.id ? t("settings.signingOut") : t("settings.signOut")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <button type="button" onClick={endOthers} disabled={busy !== null} className={button}>
              {busy === "others" ? t("settings.signingOut") : others.length === 1 ? t("settings.signOutTheOther") : t("settings.signOutAll", { n: others.length })}
            </button>
          )}
          {others.length === 0 && <p className="text-xs text-white/60">{t("settings.youreSignedInOn")}</p>}
          <label className="flex items-start gap-2 text-xs text-white/80">
            <input type="checkbox" checked={state.alerts} onChange={(e) => changeAlerts(e.target.checked)} className="mt-0.5" />
            <span>
              {t("settings.emailSignInAlerts")}
              <span className="block text-[11px] text-white/60">{t("settings.itSaysWhichKind")}</span>
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
        {t("common.close")}
      </button>
    </section>
  );
}
