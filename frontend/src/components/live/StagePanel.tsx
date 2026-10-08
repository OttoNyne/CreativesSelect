import { useState } from "react";
import { liveApi } from "../../api/live.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { LiveStage, User } from "../../types";
import { t } from "../../i18n";

function Person({ user, children }: { user: User; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={28} />
      <span className="min-w-0 flex-1 truncate text-sm text-white">{user.displayName}</span>
      {children}
    </li>
  );
}

const smallButton = "rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50";
const primaryButton = "rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50";

/** The host's view: who is asking to speak, who is invited, who is on stage, and everyone else to pick from. */
export type HostStageSection = "speaking" | "invited" | "requests" | "listeners";
const ALL_SECTIONS: HostStageSection[] = ["speaking", "invited", "requests", "listeners"];

export function HostStage({
  liveId,
  stage,
  onChange,
  sections = ALL_SECTIONS,
  heading = true,
  label = t("libmsg.guestsOnStage"),
}: {
  liveId: string;
  stage: LiveStage;
  onChange: () => void;
  /** Which lists to show (the rest of the host's screen may show the others elsewhere). */
  sections?: HostStageSection[];
  /** The "On stage  n of 9" heading and the headphones reminder. */
  heading?: boolean;
  label?: string;
}) {
  const show = (s: HostStageSection) => sections.includes(s);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requests = stage.requests ?? [];
  const invited = stage.invited ?? [];
  const listeners = stage.listeners ?? [];
  const taken = invited.length + stage.guests.length;
  const full = taken >= stage.maxGuests;

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("live.thatDidntWorkPlease"));
    } finally {
      setBusy(false);
    }
  }

  const invite = (user: User) => (
    <button onClick={() => act(() => liveApi.inviteGuest(liveId, user.id))} disabled={busy || full} className={primaryButton} aria-label={t("live.inviteAria", { name: user.displayName })}>
      {t("live.inviteToSpeak")}
    </button>
  );

  return (
    <section aria-label={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      {heading && (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">{t("live.onStage")}</h2>
            <span className="text-xs text-white/60" aria-live="polite">
              {t("live.guestPlaces", { n: taken, max: stage.maxGuests })}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/60">{t("live.inviteListenersToSpeak")}</p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {show("speaking") && stage.guests.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">{t("live.speaking")}</h3>
          <ul className="divide-y divide-white/5">
            {stage.guests.map(({ user }) => (
              <Person key={user.id} user={user}>
                <button onClick={() => act(() => liveApi.removeGuest(liveId, user.id))} disabled={busy} className={smallButton} aria-label={t("live.removeFromStage", { name: user.displayName })}>
                  {t("common.remove")}
                </button>
              </Person>
            ))}
          </ul>
        </>
      )}

      {show("invited") && invited.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">{t("live.invited")}</h3>
          <ul className="divide-y divide-white/5">
            {invited.map(({ user }) => (
              <Person key={user.id} user={user}>
                <span className="text-xs text-white/60">{t("live.waitingForAnAnswer")}</span>
                <button onClick={() => act(() => liveApi.removeGuest(liveId, user.id))} disabled={busy} className={smallButton} aria-label={t("live.withdrawAria", { name: user.displayName })}>
                  {t("live.withdraw")}
                </button>
              </Person>
            ))}
          </ul>
        </>
      )}

      {show("requests") && requests.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">{t("live.askingToSpeak")}</h3>
          <ul className="divide-y divide-white/5">
            {requests.map(({ user }) => (
              <Person key={user.id} user={user}>
                {invite(user)}
                <button onClick={() => act(() => liveApi.removeGuest(liveId, user.id))} disabled={busy} className={smallButton} aria-label={t("live.dismissAria", { name: user.displayName })}>
                  {t("common.dismiss")}
                </button>
              </Person>
            ))}
          </ul>
        </>
      )}

      {show("listeners") && (
        <>
        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">{t("live.listeningHeading", { n: listeners.length })}</h3>
        {listeners.length === 0 ? (
          <p className="mt-1 text-sm text-white/60">{t("live.noOneElseIs")}</p>
        ) : (
          <ul className="mt-1 max-h-56 divide-y divide-white/5 overflow-y-auto pe-1">
            {listeners.map(({ user }) => (
              <Person key={user.id} user={user}>
                {invite(user)}
              </Person>
            ))}
          </ul>
        )}
        </>
      )}
      {full && <p className="mt-2 text-xs text-white/60">{t("live.theStageIsFull")}</p>}
    </section>
  );
}

export interface ListenerStageProps {
  stage: LiveStage;
  /** True while a request to the server (or the microphone) is in progress. */
  busy: boolean;
  error: string | null;
  /** The guest's microphone is on (not muted). */
  micOn: boolean;
  /** The microphone has been started at all, whether or not it is muted right now. */
  micStarted: boolean;
  onRequest: () => void;
  /** Withdraw the request, decline the invitation, or leave the stage. */
  onLeave: () => void;
  onAccept: () => void;
  onToggleMute: () => void;
  onStartMic: () => void;
}

/** A listener's view: raise a hand, answer an invitation, and manage their microphone while on stage. */
export function ListenerStage({ stage, busy, error, micOn, micStarted, onRequest, onLeave, onAccept, onToggleMute, onStartMic }: ListenerStageProps) {
  const me = stage.me ?? "listener";
  return (
    <section aria-label={t("live.speakingInThisLive")} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      {stage.guests.length > 0 && (
        <p className="mb-3 text-sm text-white/70">
          {t("live.onStageWithHostLabel")} <span className="text-white">{stage.guests.map((g) => g.user.displayName).join(", ")}</span>
        </p>
      )}

      {me === "listener" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-white/70">{t("live.wantToSaySomething")}</p>
          <button onClick={onRequest} disabled={busy} className={primaryButton}>
            {t("live.askToSpeak")}
          </button>
        </div>
      )}

      {me === "requested" && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-white/80">
            {t("live.youAskedToSpeak")}
          </p>
          <button onClick={onLeave} disabled={busy} className={smallButton}>
            {t("common.cancel")}
          </button>
        </div>
      )}

      {me === "invited" && (
        <div>
          <p role="status" className="text-sm font-medium text-white">
            {t("live.theHostInvitedYou")}
          </p>
          <p className="mt-1 text-xs text-white/60">{t("live.everyoneInTheLive")}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={onAccept} disabled={busy} className={primaryButton}>
              {t("live.joinTheStage")}
            </button>
            <button onClick={onLeave} disabled={busy} className={smallButton}>
              {t("live.notNow")}
            </button>
          </div>
        </div>
      )}

      {me === "speaking" && (
        <div>
          <p role="status" className="text-sm font-medium text-white">
            {!micStarted ? t("live.youreOnStageBut") : micOn ? t("live.youreOnStageEveryone") : t("live.youreOnStageMuted")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!micStarted ? (
              <button onClick={onStartMic} disabled={busy} className={primaryButton}>
                {t("live.turnOnMicrophone")}
              </button>
            ) : (
              <button onClick={onToggleMute} aria-pressed={!micOn} className={smallButton}>
                {micOn ? t("live.muteMyMicrophone") : t("live.unmuteMyMicrophone")}
              </button>
            )}
            <button onClick={onLeave} disabled={busy} className={smallButton}>
              {t("live.leaveTheStage")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
