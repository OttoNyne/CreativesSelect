import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { PUSH_CATEGORIES, pushApi, type PushCategory, type PushPrefs } from "../../api/push.api";
import { PushError, currentSubscription, disablePush, enablePush, notificationPermission, pushSupport } from "../../lib/push";
import { t } from "../../i18n";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" } // the site isn't set up to send them
  | { kind: "needs-install" } // an iPhone, until the site is on the Home Screen
  | { kind: "unsupported" }
  | { kind: "blocked" } // the person said no in the browser
  | { kind: "off"; publicKey: string }
  | { kind: "on"; prefs: PushPrefs };

/** Turning notifications on for this device, which kinds to get, and a test: in the owner's own settings. */
export function PushSettings() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { enabled, publicKey } = await pushApi.key();
        if (cancelled) return;
        if (!enabled || !publicKey) return setState({ kind: "unavailable" });
        const support = pushSupport();
        if (support !== "supported") return setState({ kind: support });
        const subscription = await currentSubscription();
        if (cancelled) return;
        if (subscription) {
          const status = await pushApi.status(subscription.endpoint);
          if (!cancelled) setState(status.thisDevice ? { kind: "on", prefs: status.prefs } : { kind: "off", publicKey });
        } else {
          setState(notificationPermission() === "denied" ? { kind: "blocked" } : { kind: "off", publicKey });
        }
      } catch {
        if (!cancelled) setState({ kind: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn(publicKey: string) {
    setBusy(true);
    setMessage(null);
    try {
      await enablePush(publicKey);
      const subscription = await currentSubscription();
      const status = await pushApi.status(subscription?.endpoint);
      setState({ kind: "on", prefs: status.prefs });
    } catch (err) {
      if (err instanceof PushError && err.reason === "denied") setState({ kind: "blocked" });
      else setMessage({ text: err instanceof PushError || err instanceof ApiError ? err.message : t("settings.couldntTurnNotificationsOn"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (state.kind !== "on") return;
    setBusy(true);
    setMessage(null);
    try {
      await disablePush();
      const { publicKey } = await pushApi.key();
      setState({ kind: "off", publicKey: publicKey ?? "" });
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : t("settings.couldntTurnNotificationsOff"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function change(name: PushCategory, on: boolean) {
    if (state.kind !== "on") return;
    const before = state.prefs;
    setState({ kind: "on", prefs: { ...before, [name]: on } });
    setMessage(null);
    try {
      const { prefs } = await pushApi.setPrefs({ [name]: on });
      setState({ kind: "on", prefs });
    } catch (err) {
      setState({ kind: "on", prefs: before });
      setMessage({ text: err instanceof ApiError ? err.message : t("common.saveChangeFailed"), error: true });
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const { sent } = await pushApi.test();
      setMessage(sent > 0 ? { text: t("settings.pushSent"), error: false } : { text: t("settings.pushNotDelivered"), error: true });
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : t("settings.couldntSendATest"), error: true });
    } finally {
      setBusy(false);
    }
  }

  const button = "rounded-md border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50";
  return (
    <section aria-label={t("settings.notificationsOnThisDevice")} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("settings.notificationsOnThisDevice")}</h3>
      {state.kind === "loading" && <p className="text-xs text-white/60">{t("common.checking")}</p>}
      {state.kind === "unavailable" && <p className="text-xs text-white/60">{t("settings.notificationsToYourPhone")}</p>}
      {state.kind === "unsupported" && <p className="text-xs text-white/60">{t("settings.thisBrowserCantShow")}</p>}
      {state.kind === "needs-install" && (
        <p className="text-xs text-white/60">{t("settings.onAnIphoneFirst")}</p>
      )}
      {state.kind === "blocked" && <p className="text-xs text-white/60">{t("settings.notificationsAreBlockedFor")}</p>}
      {state.kind === "off" && (
        <>
          <p className="text-xs text-white/60">{t("settings.getANotificationOn")}</p>
          <button type="button" onClick={() => turnOn(state.publicKey)} disabled={busy || !state.publicKey} className={button}>
            {busy ? t("settings.turningOn") : t("settings.turnOnNotificationsOn")}
          </button>
        </>
      )}
      {state.kind === "on" && (
        <>
          <p className="text-xs text-emerald-400">{t("settings.notificationsAreOnFor")}</p>
          <ul className="space-y-1">
            {PUSH_CATEGORIES.map((c) => (
              <li key={c.name}>
                <label className="flex items-start gap-2 text-xs text-white/80">
                  <input type="checkbox" checked={state.prefs[c.name]} onChange={(e) => change(c.name, e.target.checked)} aria-describedby={`push-${c.name}`} className="mt-0.5" />
                  <span>
                    {c.label}
                    <span id={`push-${c.name}`} className="block text-[11px] text-white/60">
                      {c.hint}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={busy} className={button}>
              {t("settings.sendMeATest")}
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className={button}>
              {t("settings.turnOffOnThis")}
            </button>
          </div>
        </>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-xs ${message.error ? "text-red-400" : "text-emerald-400"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
