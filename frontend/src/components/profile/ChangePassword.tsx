import { useState } from "react";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";

const MIN_LENGTH = 8;

export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN_LENGTH) return setError(`New password must be at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await authApi.changePassword(current, next);
      reset();
      setOpen(false);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change your password, try again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none";

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
          className="text-xs text-white/60 hover:text-white"
        >
          Change password…
        </button>
        {done && <span className="text-xs text-emerald-400">Password changed ✓</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className={field}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={`New password (${MIN_LENGTH}+ characters)`}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className={field}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={field}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!current || !next || !confirm || busy}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Change password"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
