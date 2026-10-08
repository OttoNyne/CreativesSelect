import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { t } from "../../i18n";

// The shared frame for the About, Features and How it works pages: a heading, the content, and a way onward
// (to sign up when signed out, or back to the feed when signed in).
export function InfoPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const { user } = useAuth();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
      <p className="mt-3 text-lg text-white/70">{intro}</p>
      <div className="mt-8">{children}</div>

      <div className="mt-10 rounded-xl border border-violet-500/30 bg-violet-500/10 p-5 text-center">
        {user ? (
          <Link to="/" className="inline-block rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
            {t("verify.goFeed")}
          </Link>
        ) : (
          <>
            <p className="text-white/80">{t("info.readyToJoin")}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className="rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
                {t("info.createYourAccount")}
              </Link>
              <Link to="/login" className="rounded-md border border-white/20 px-5 py-2.5 text-sm text-white/80 hover:bg-white/10">
                {t("login.submit")}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
