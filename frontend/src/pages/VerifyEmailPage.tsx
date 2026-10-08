import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { t } from "../i18n";
import { tRich } from "../i18n/rich";

const tokenFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, "")).get("token") ?? "";

// The emailed link is /verify-email#token=…  The token is in the fragment so it is never sent to a server or leaked
// in a Referer; it's read once and removed from the address bar. The page confirms the address as soon as it opens.
export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [token, setToken] = useState(() => tokenFromHash(location.hash));
  const [state, setState] = useState<"working" | "done" | "failed" | "missing">(token ? "working" : "missing");
  const [error, setError] = useState<string | null>(null);
  const lastTried = useRef<string | null>(null);

  // Also covers opening another link while already on this page (the hash changes, the page doesn't reload).
  useEffect(() => {
    if (!location.hash) return;
    const fresh = tokenFromHash(location.hash);
    if (fresh && fresh !== token) {
      setToken(fresh);
      setState("working");
      setError(null);
    }
    navigate(location.pathname, { replace: true });
  }, [location.hash, location.pathname, navigate, token]);

  useEffect(() => {
    if (!token || lastTried.current === token) return;
    lastTried.current = token;
    authApi
      .verifyEmail(token)
      .then(async () => {
        setState("done");
        await refresh(); // so a signed-in person's reminder goes away straight away
      })
      .catch((err) => {
        setState("failed");
        setError(err instanceof ApiError ? err.message : t("common.somethingWrongRetry"));
      });
  }, [token, refresh]);

  const box = "mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6";

  if (state === "working") {
    return (
      <div className={box}>
        <h1 className="text-xl font-bold text-white">{t("verify.working")}</h1>
        <p role="status" className="mt-3 text-sm text-white/60">
          {t("common.oneMoment")}
        </p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className={box}>
        <h1 className="text-xl font-bold text-white">{t("verify.doneTitle")}</h1>
        <p role="status" className="mt-3 text-sm text-white/70">
          {t("verify.done")}
        </p>
        <Link to={user ? "/" : "/login"} className="mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          {user ? t("verify.goFeed") : t("common.logIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className={box}>
      <h1 className="text-xl font-bold text-white">{state === "missing" ? t("verify.missingTitle") : t("verify.failedTitle")}</h1>
      <p role="alert" className="mt-3 text-sm text-white/70">
        {state === "missing" ? t("verify.missing") : error}
      </p>
      <p className="mt-3 text-sm text-white/60">
        {user ? (
          <>{t("verify.helpSignedIn")}</>
        ) : (
          <>
            {tRich("verify.helpSignedOut", { login: (c) => <Link to="/login" className="text-violet-400 hover:underline">{c}</Link> })}
          </>
        )}
      </p>
    </div>
  );
}
