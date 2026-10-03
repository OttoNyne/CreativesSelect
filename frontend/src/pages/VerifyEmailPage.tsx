import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

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
        setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
      });
  }, [token, refresh]);

  const box = "mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6";

  if (state === "working") {
    return (
      <div className={box}>
        <h1 className="text-xl font-bold text-white">Confirming your email…</h1>
        <p role="status" className="mt-3 text-sm text-white/60">
          One moment.
        </p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className={box}>
        <h1 className="text-xl font-bold text-white">Email confirmed</h1>
        <p role="status" className="mt-3 text-sm text-white/70">
          Thanks — your email address is confirmed.
        </p>
        <Link to={user ? "/" : "/login"} className="mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          {user ? "Go to your feed" : "Log in"}
        </Link>
      </div>
    );
  }

  return (
    <div className={box}>
      <h1 className="text-xl font-bold text-white">{state === "missing" ? "Confirmation link needed" : "Couldn't confirm your email"}</h1>
      <p role="alert" className="mt-3 text-sm text-white/70">
        {state === "missing" ? "This page needs the link from your confirmation email. Open that link from the email." : error}
      </p>
      <p className="mt-3 text-sm text-white/60">
        {user ? (
          <>You can ask for a new link from the reminder at the top of the page, or from your profile&apos;s edit panel.</>
        ) : (
          <>
            Log in and ask for a new link from the reminder at the top of the page.{" "}
            <Link to="/login" className="text-violet-400 hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
