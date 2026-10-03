import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useResendVerification } from "../../lib/useResendVerification";

const KEY = "verify-email-banner-dismissed";
const wasDismissed = () => {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

// A reminder for signed-in people who haven't confirmed their email yet. It can be closed for the visit and
// comes back next time until the address is confirmed.
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const { state, message, resend } = useResendVerification();

  if (!user || user.emailVerified !== false || dismissed || pathname === "/verify-email") return null;

  return (
    <div role="region" aria-label="Confirm your email" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
        <p className="flex-1 basis-64">
          <strong className="font-semibold text-white">Please confirm your email.</strong> We sent a link to{" "}
          <span className="break-all text-white">{user.email}</span>.
          {message && (
            <span role={state === "error" ? "alert" : "status"} className={`ml-1 ${state === "error" ? "text-red-300" : "text-emerald-300"}`}>
              {message}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={state === "sending"}
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Resend email"}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(KEY, "1");
            } catch {
              // fine: it just comes back on the next page load
            }
            setDismissed(true);
          }}
          aria-label="Dismiss this reminder"
          className="-my-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
