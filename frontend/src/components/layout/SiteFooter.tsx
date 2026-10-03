import { Link } from "react-router-dom";
import { ShareButton } from "../share/ShareButton";
import { siteUrl } from "../../lib/share";

const LINKS = [
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/how-it-works", label: "How it works" },
];

// Shown at the bottom of every page, so the information pages are one tap away, signed in or not.
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-white/10 px-4 py-6 pb-20 text-sm text-white/60">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p>
          <span className="font-semibold text-white/70">CreativesSelect</span> — a home for creatives.
        </p>
        <nav aria-label="About this site" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="py-1 text-white/60 hover:text-white hover:underline">
              {l.label}
            </Link>
          ))}
          <ShareButton
            url={siteUrl}
            title="Share CreativesSelect"
            description="Anyone who scans this code, or opens the link, lands on the site."
            className="py-1 text-white/60 hover:text-white hover:underline"
          >
            Share this site
          </ShareButton>
        </nav>
      </div>
    </footer>
  );
}
