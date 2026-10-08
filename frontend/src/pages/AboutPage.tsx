import { Link } from "react-router-dom";
import { InfoPage } from "../components/layout/InfoPage";
import { t } from "../i18n";
import { tRich } from "../i18n/rich";

export function AboutPage() {
  return (
    <InfoPage
      title={t("info.aboutCreativesselect")}
      intro={t("info.aboutIntro")}
    >
      <div className="space-y-6 text-white/80">
        <section>
          <h2 className="text-lg font-semibold text-white">{t("info.whyItExists")}</h2>
          <p className="mt-2">
            {t("info.creativeWorkIsEasier")}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">{t("info.whoItsFor")}</h2>
          <p className="mt-2">
            {t("info.anyoneMakingThingsWhether")}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">{t("info.youreInControl")}</h2>
          <p className="mt-2">
            {t("info.profilesCanBePublic")}
          </p>
        </section>

        <p className="text-sm text-white/60">
          {tRich("info.aboutFooter", {
            features: (c) => (
              <Link to="/features" className="text-violet-400 hover:underline">
                {c}
              </Link>
            ),
            how: (c) => (
              <Link to="/how-it-works" className="text-violet-400 hover:underline">
                {c}
              </Link>
            ),
          })}
        </p>
      </div>
    </InfoPage>
  );
}
