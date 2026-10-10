import { Link } from "react-router-dom";
import { LogoMark } from "../common/Logo";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import { ShareButton } from "../share/ShareButton";
import { siteUrl } from "../../lib/share";
import { t } from "../../i18n";

const LINKS = [
  { to: "/about", label: () => t("footer.about") },
  { to: "/features", label: () => t("footer.features") },
  { to: "/how-it-works", label: () => t("footer.howItWorks") },
  { to: "/privacy", label: () => t("footer.privacy") },
  { to: "/terms", label: () => t("footer.terms") },
  { to: "/guidelines", label: () => t("footer.guidelines") },
];

// Shown at the bottom of every page, so the information pages are one tap away, signed in or not.
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-white/10 px-4 py-6 pb-20 text-sm text-white/60">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p>
          <LogoMark height={16} glow={false} className="me-1.5 inline-block align-[-3px]" />
          <span className="font-semibold text-white/70">CreativesSelect</span> — {t("footer.tagline")}
        </p>
        <nav aria-label={t("footer.navLabel")} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="py-1 text-white/60 hover:text-white hover:underline">
              {l.label()}
            </Link>
          ))}
          <ShareButton
            url={siteUrl}
            title={t("nav.shareTitle")}
            description={t("nav.shareDescription")}
            className="py-1 text-white/60 hover:text-white hover:underline"
          >
            {t("nav.shareSite")}
          </ShareButton>
          <LanguageSwitcher className="py-1" />
        </nav>
      </div>
    </footer>
  );
}
