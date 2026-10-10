import { Link } from "react-router-dom";
import { useRobots } from "../lib/useRobots";
import { t } from "../i18n";

/** An address that isn't a page of the site (an old or mistyped link, or something that was removed): says so, and offers the way home. */
export function NotFoundPage() {
  useRobots(false); // never something for search engines to list
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-white">{t("notFound.title")}</h1>
      <p className="mt-3 text-white/70">{t("notFound.text")}</p>
      <Link to="/" className="mt-6 inline-block rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
        {t("notFound.home")}
      </Link>
    </main>
  );
}
