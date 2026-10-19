import { Link } from "react-router-dom";
import { SpotlightSlots } from "../components/home/SpotlightSlots";
import { t } from "../i18n";

/** The main screen for someone who isn't signed in: what the site is, the two artist spotlights, and the way in. */
export function LandingPage() {
  const points = [1, 2, 3] as const;
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <header className="space-y-4 text-center">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{t("landing.title")}</h1>
        <p className="mx-auto max-w-2xl text-base text-white/80">{t("landing.subtitle")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/register" className="rounded-md bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500">
            {t("landing.join")}
          </Link>
          <Link to="/login" className="rounded-md border border-white/25 px-5 py-2 text-sm font-medium text-white hover:bg-white/10">
            {t("landing.logIn")}
          </Link>
        </div>
      </header>

      <SpotlightSlots />

      <section aria-label={t("landing.points")}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {points.map((n) => (
            <li key={n} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-base font-semibold text-white">{t(`landing.point${n}.title` as const)}</h2>
              <p className="mt-1 text-sm text-white/75">{t(`landing.point${n}.text` as const)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
