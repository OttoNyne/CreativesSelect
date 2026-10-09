import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { digestApi } from "../api/topics.api";
import { t } from "../i18n";

const tokenFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, "")).get("token") ?? "";

// The link in the weekly summary email is /digest/unsubscribe#token=…  The token is in the fragment so it is never sent to a server or leaked
// in a Referer; it is read once, removed from the address bar, and used to turn the summary off. No sign-in is needed.
export function DigestUnsubscribePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => tokenFromHash(location.hash));
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const tried = useRef(false);

  useEffect(() => {
    if (location.hash) navigate(location.pathname, { replace: true });
  }, [location.hash, location.pathname, navigate]);

  useEffect(() => {
    if (!token || tried.current) return;
    tried.current = true;
    digestApi
      .unsubscribe(token)
      .then(() => setState("done"))
      .catch(() => setState("failed"));
  }, [token]);

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-bold text-white">{t("digest.title")}</h1>
      {state === "working" && (
        <p role="status" className="text-sm text-white/70">
          {t("digest.unsubWorking")}
        </p>
      )}
      {state === "done" && (
        <>
          <p role="status" className="text-sm text-white/90">
            {t("digest.unsubDone")}
          </p>
          <p className="text-xs text-white/60">{t("digest.unsubDoneHint")}</p>
        </>
      )}
      {state === "failed" && (
        <p role="alert" className="text-sm text-red-300">
          {t("digest.unsubFailed")}
        </p>
      )}
      <Link to="/" className="inline-block text-sm text-violet-300 hover:underline">
        {t("digest.home")}
      </Link>
    </div>
  );
}
