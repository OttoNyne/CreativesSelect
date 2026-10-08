import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { t, translateServerMessage } from "../i18n";
import { tRich } from "../i18n/rich";

const inputClass =
  "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

// The emailed link is /reset-password#token=…  The token is in the fragment so it is
// never sent to a server or leaked in a Referer; it's read once and then removed
// from the address bar so it doesn't linger in the browser history.
const tokenFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, "")).get("token") ?? "";

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => tokenFromHash(location.hash));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Also covers opening a link while already on this page (the hash changes, the page doesn't reload).
  useEffect(() => {
    if (!location.hash) return;
    const fresh = tokenFromHash(location.hash);
    if (fresh) setToken(fresh);
    navigate(location.pathname, { replace: true });
  }, [location.hash, location.pathname, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("reset.tooShort"));
    if (password !== confirm) return setError(t("reset.mismatch"));
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.somethingWrongRetry"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h1 className="text-xl font-bold text-white">{t("reset.doneTitle")}</h1>
        <p role="status" className="mt-3 text-sm text-white/70">
          {t("reset.done")}
        </p>
        <Link to="/login" className="mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          {t("common.logIn")}
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h1 className="text-xl font-bold text-white">{t("reset.needLinkTitle")}</h1>
        <p className="mt-3 text-sm text-white/70">
          {tRich("reset.needLink", { request: (c) => <Link to="/forgot-password" className="text-violet-400 hover:underline">{c}</Link> })}
        </p>
      </div>
    );
  }

  // the server's words for a link that no longer works (in the language in use, as the error was translated when it arrived)
  const linkProblem = error === translateServerMessage("This reset link is invalid or has expired");

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-bold text-white">{t("reset.title")}</h1>
      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder={t("reset.newPasswordPlaceholder")}
          aria-label={t("reset.newPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder={t("reset.repeat")}
          aria-label={t("reset.repeat")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
            {linkProblem && (
              <>
                {" "}
                <Link to="/forgot-password" className="text-violet-400 hover:underline">
                  {t("reset.requestNew")}
                </Link>
              </>
            )}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting ? t("reset.saving") : t("reset.submit")}
        </button>
      </form>
    </div>
  );
}
