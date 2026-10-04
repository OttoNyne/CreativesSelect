import { useState } from "react";
import { Link } from "react-router-dom";
import { scheduledApi } from "../../api/scheduled.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import { formatWhen, untilText } from "../../lib/when";
import type { ScheduledLive } from "../../types";

/**
 * Lives people have planned. Anyone can ask to be reminded (toggle); the host can start theirs now, or cancel it.
 */
export function UpcomingLives({
  plans,
  onChange,
  onStartNow,
  starting,
  now = new Date(),
}: {
  plans: ScheduledLive[] | null;
  /** The list changed (a reminder toggled, a plan cancelled). */
  onChange: (plans: ScheduledLive[]) => void;
  /** The host chose to start a plan now (the page asks for the microphone from that tap). */
  onStartNow: (plan: ScheduledLive) => void;
  starting: boolean;
  now?: Date;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleReminder(plan: ScheduledLive) {
    setBusyId(plan.id);
    setError(null);
    try {
      const result = plan.reminding ? await scheduledApi.unremind(plan.id) : await scheduledApi.remind(plan.id);
      onChange((plans ?? []).map((p) => (p.id === plan.id ? { ...p, reminding: result.reminding, reminderCount: result.reminderCount } : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(plan: ScheduledLive) {
    if (!window.confirm(`Cancel "${plan.title}"? The people who asked to be reminded won't be told.`)) return;
    setBusyId(plan.id);
    setError(null);
    try {
      await scheduledApi.cancel(plan.id);
      onChange((plans ?? []).filter((p) => p.id !== plan.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel that live.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Upcoming lives">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Upcoming</h2>
      {plans === null && <p className="text-sm text-white/60">Loading…</p>}
      {plans?.length === 0 && <p className="text-sm text-white/60">Nothing is scheduled yet. Plan one above and let your friends know.</p>}
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {plans?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <Avatar username={p.host.username} displayName={p.host.displayName} avatarUrl={p.host.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white">{p.title}</p>
              <p className="truncate text-xs text-white/70">
                <Link to={`/u/${p.host.username}`} className="hover:underline">
                  {p.isHost ? "You" : p.host.displayName}
                </Link>{" "}
                · {formatWhen(p.startsAt)} · <span>{untilText(p.startsAt, now)}</span>
                {p.reminderCount > 0 && ` · ${p.reminderCount} reminding`}
              </p>
            </div>
            {p.isHost ? (
              <div className="flex gap-2">
                <button onClick={() => onStartNow(p)} disabled={starting} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                  Start now
                </button>
                <button onClick={() => cancel(p)} disabled={busyId === p.id} aria-label={`Cancel ${p.title}`} className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => toggleReminder(p)}
                disabled={busyId === p.id}
                aria-pressed={p.reminding}
                aria-label={`${p.reminding ? "Stop reminding me about" : "Remind me about"} ${p.title}`}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  p.reminding ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white hover:bg-white/10"
                }`}
              >
                {p.reminding ? "✓ Reminding you" : "Remind me"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
