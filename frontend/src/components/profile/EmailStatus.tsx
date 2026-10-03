import { useAuth } from "../../context/AuthContext";
import { useResendVerification } from "../../lib/useResendVerification";

// In the profile's edit panel: whether the account's email is confirmed, with a way to get a new link.
export function EmailStatus() {
  const { user } = useAuth();
  const { state, message, resend } = useResendVerification();
  if (!user?.email || user.emailVerified === undefined) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Email</p>
      <p className="mt-1 break-all text-sm text-white/80">{user.email}</p>
      {user.emailVerified ? (
        <p className="mt-1 text-xs text-emerald-400">✓ Confirmed</p>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-amber-300">Not confirmed yet</span>
          <button
            type="button"
            onClick={resend}
            disabled={state === "sending"}
            className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Send confirmation email"}
          </button>
          {message && (
            <span role={state === "error" ? "alert" : "status"} className={`text-xs ${state === "error" ? "text-red-300" : "text-emerald-300"}`}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
