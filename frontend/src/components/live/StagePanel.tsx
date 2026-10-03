import { useState } from "react";
import { liveApi } from "../../api/live.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { LiveStage, User } from "../../types";

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
export function HostStage({ liveId, stage, onChange }: { liveId: string; stage: LiveStage; onChange: () => void }) {
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
      setError(err instanceof ApiError ? err.message : "That didn't work — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const invite = (user: User) => (
    <button onClick={() => act(() => liveApi.inviteGuest(liveId, user.id))} disabled={busy || full} className={primaryButton} aria-label={`Invite ${user.displayName} to speak`}>
      Invite to speak
    </button>
  );

  return (
    <section aria-label="Guests on stage" className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">On stage</h2>
        <span className="text-xs text-white/60" aria-live="polite">
          {taken} of {stage.maxGuests} guest places used
        </span>
      </div>
      <p className="mt-1 text-xs text-white/60">Invite listeners to speak. Use headphones while guests are on stage so their voices don&apos;t echo back.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {stage.guests.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">Speaking</h3>
          <ul className="divide-y divide-white/5">
            {stage.guests.map(({ user }) => (
              <Person key={user.id} user={user}>
                <button onClick={() => act(() => liveApi.removeGuest(liveId, user.id))} disabled={busy} className={smallButton} aria-label={`Remove ${user.displayName} from the stage`}>
                  Remove
                </button>
              </Person>
            ))}
          </ul>
        </>
      )}

      {invited.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">Invited</h3>
          <ul className="divide-y divide-white/5">
            {invited.map(({ user }) => (
              <Person key={user.id} user={user}>
                <span className="text-xs text-white/60">waiting for an answer</span>
                <button onClick={() => act(() => liveApi.removeGuest(liveId, user.id))} disabled={busy} className={smallButton} aria-label={`Withdraw the invitation to ${user.displayName}`}>
                  Withdraw
                </button>
              </Person>
            ))}
          </ul>
        </>
      )}

      {requests.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">Asking to speak</h3>
          <ul className="divide-y divide-white/5">
            {requests.map(({ user }) => (
              <Person key={user.id} user={user}>
                {invite(user)}
                <button onClick={() => act(() => liveApi.removeGuest(liveId, user.id))} disabled={busy} className={smallButton} aria-label={`Dismiss ${user.displayName}'s request`}>
                  Dismiss
                </button>
              </Person>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/60">Listening ({listeners.length})</h3>
      {listeners.length === 0 ? (
        <p className="mt-1 text-sm text-white/60">No one else is listening yet.</p>
      ) : (
        <ul className="mt-1 max-h-56 divide-y divide-white/5 overflow-y-auto pr-1">
          {listeners.map(({ user }) => (
            <Person key={user.id} user={user}>
              {invite(user)}
            </Person>
          ))}
        </ul>
      )}
      {full && <p className="mt-2 text-xs text-white/60">The stage is full. Remove a guest to invite someone else.</p>}
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
    <section aria-label="Speaking in this live" className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      {stage.guests.length > 0 && (
        <p className="mb-3 text-sm text-white/70">
          On stage with the host: <span className="text-white">{stage.guests.map((g) => g.user.displayName).join(", ")}</span>
        </p>
      )}

      {me === "listener" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-white/70">Want to say something? Ask the host to bring you on stage.</p>
          <button onClick={onRequest} disabled={busy} className={primaryButton}>
            Ask to speak
          </button>
        </div>
      )}

      {me === "requested" && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-white/80">
            You asked to speak. Waiting for the host…
          </p>
          <button onClick={onLeave} disabled={busy} className={smallButton}>
            Cancel
          </button>
        </div>
      )}

      {me === "invited" && (
        <div>
          <p role="status" className="text-sm font-medium text-white">
            The host invited you to speak!
          </p>
          <p className="mt-1 text-xs text-white/60">Everyone in the live will hear your microphone. Use headphones to avoid an echo.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={onAccept} disabled={busy} className={primaryButton}>
              Join the stage
            </button>
            <button onClick={onLeave} disabled={busy} className={smallButton}>
              Not now
            </button>
          </div>
        </div>
      )}

      {me === "speaking" && (
        <div>
          <p role="status" className="text-sm font-medium text-white">
            {!micStarted ? "You're on stage, but your microphone is off." : micOn ? "You're on stage — everyone can hear you." : "You're on stage, muted."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!micStarted ? (
              <button onClick={onStartMic} disabled={busy} className={primaryButton}>
                Turn on microphone
              </button>
            ) : (
              <button onClick={onToggleMute} aria-pressed={!micOn} className={smallButton}>
                {micOn ? "Mute my microphone" : "Unmute my microphone"}
              </button>
            )}
            <button onClick={onLeave} disabled={busy} className={smallButton}>
              Leave the stage
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
