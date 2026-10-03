import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";

const inputClass =
  "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Unless the site says it can't send email, assume it can (a failed check shouldn't block anyone).
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .resetAvailable()
      .then(({ available }) => !cancelled && setUnavailable(!available))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-bold text-white">Forgot your password?</h1>

      {unavailable ? (
        <div className="mt-4 space-y-3 text-sm text-white/70">
          <p role="status">
            Password reset by email isn&apos;t set up on this site yet, so a link can&apos;t be sent. Please contact the site owner to get
            back into your account.
          </p>
          <Link to="/login" className="inline-block text-violet-400 hover:underline">
            Back to log in
          </Link>
        </div>
      ) : sentTo ? (
        <div className="mt-4 space-y-3 text-sm text-white/70">
          {/* The same message whether or not the address has an account. */}
          <p role="status">
            If <span className="font-medium text-white">{sentTo}</span> has an account, a link to choose a new password is on its way. It
            works for one hour.
          </p>
          <p className="text-white/60">Nothing there? Check your spam folder, or try again in a few minutes.</p>
          <Link to="/login" className="inline-block text-violet-400 hover:underline">
            Back to log in
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-white/60">Enter your account email and we&apos;ll send you a link to choose a new one.</p>
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-white/60">
            <Link to="/login" className="text-violet-400 hover:underline">
              Back to log in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
