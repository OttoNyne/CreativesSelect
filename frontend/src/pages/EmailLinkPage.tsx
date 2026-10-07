import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

const tokenFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, "")).get("token") ?? "";

interface Props {
  /** What opening the link does: it is sent once, as soon as the page opens. */
  act: (token: string) => Promise<void>;
  working: string;
  doneTitle: string;
  doneText: string;
  failedTitle: string;
  missingText: string;
  /** Where to go from here: signed-in people, and everyone else. */
  next: { signedIn: { to: string; label: string }; signedOut: { to: string; label: string } };
}

// The emailed links look like /confirm-email-change#token=… The token is in the fragment so it is never sent to a server or leaked
// in a Referer; it is read once, removed from the address bar, and used as soon as the page opens (the same way as the link that
// confirms an email address).
export function EmailLinkPage({ act, working, doneTitle, doneText, failedTitle, missingText, next }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [token, setToken] = useState(() => tokenFromHash(location.hash));
  const [state, setState] = useState<"working" | "done" | "failed" | "missing">(token ? "working" : "missing");
  const [error, setError] = useState<string | null>(null);
  const lastTried = useRef<string | null>(null);

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
    act(token)
      .then(async () => {
        setState("done");
        await refresh(); // a signed-in person sees the new address (or the sign-out) straight away
      })
      .catch((err) => {
        setState("failed");
        setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
      });
  }, [token, act, refresh]);

  const box = "mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6";
  const button = "mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500";

  if (state === "working") {
    return (
      <div className={box}>
        <h1 className="text-xl font-bold text-white">{working}</h1>
        <p role="status" className="mt-3 text-sm text-white/60">
          One moment.
        </p>
      </div>
    );
  }

  if (state === "done") {
    const go = user ? next.signedIn : next.signedOut;
    return (
      <div className={box}>
        <h1 className="text-xl font-bold text-white">{doneTitle}</h1>
        <p role="status" className="mt-3 text-sm text-white/70">
          {doneText}
        </p>
        <Link to={go.to} className={button}>
          {go.label}
        </Link>
      </div>
    );
  }

  return (
    <div className={box}>
      <h1 className="text-xl font-bold text-white">{state === "missing" ? "Link needed" : failedTitle}</h1>
      <p role="alert" className="mt-3 text-sm text-white/70">
        {state === "missing" ? missingText : error}
      </p>
      <p className="mt-3 text-sm text-white/60">
        <Link to="/login" className="text-violet-400 hover:underline">
          Log in
        </Link>{" "}
        to ask again from your profile&apos;s edit panel.
      </p>
    </div>
  );
}
