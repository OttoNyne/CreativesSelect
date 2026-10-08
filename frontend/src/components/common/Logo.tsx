import { useId } from "react";
import { t } from "../../i18n";

// The CreativesSelect mark: a "C" in cyan and blue that interlocks with an "S" in violet and magenta, drawn as plain shapes so it stays
// sharp at any size. The same shapes are in public/logo-mark.svg and public/favicon.svg.
const C_PATH = "M91 10C55 10 11 25 11 57C11 90 38 104 77 103L84 80L82 78C55 78 41 72 41 57C41 42 55 37 79 37Z";
const S_PATH = "M83 49C83 40 92 37 105 37C135 37 150 58 150 82C150 108 135 129 108 129L72 129L83 103L108 103C118 103 124 95 124 82C124 70 115 62 100 62L90 62C85 62 83 56 83 49Z";

/** Just the mark. Decorative: put the name next to it (or give it a `title`). */
export function LogoMark({ height = 28, glow = true, title, className = "" }: { height?: number; glow?: boolean; title?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="6 5 149 129"
      height={height}
      width={(height * 149) / 129}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={className}
      style={glow ? { filter: "drop-shadow(0 0 5px rgba(99,102,241,0.55))" } : undefined}
    >
      <defs>
        <linearGradient id={`${id}c`} x1="18" y1="14" x2="76" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b4f4ee" />
          <stop offset="0.35" stopColor="#7fd8ee" />
          <stop offset="0.65" stopColor="#3b6cff" />
          <stop offset="1" stopColor="#4b2ee8" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="84" y1="40" x2="146" y2="128" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#86b6f5" />
          <stop offset="0.45" stopColor="#b865f2" />
          <stop offset="1" stopColor="#e83ee8" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="11" y1="10" x2="110" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={C_PATH} fill={`url(#${id}c)`} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={S_PATH} transform="translate(3 2.5)" fill="#6d28d9" />
      <path d={S_PATH} fill={`url(#${id}s)`} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={C_PATH} fill={`url(#${id}h)`} />
      <path d={S_PATH} fill={`url(#${id}h)`} />
    </svg>
  );
}

/** The mark and the name, as shown in the top bar and on the sign-in pages. */
export function Logo({ height = 28, tagline = false, className = "" }: { height?: number; tagline?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark height={height} />
      <span className="flex flex-col leading-none">
        <span className="font-semibold tracking-tight text-white" style={{ fontSize: Math.round(height * 0.72) }}>
          Creatives<span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400 bg-clip-text text-transparent">{t("media.select")}</span>
        </span>
        {tagline && <span className="mt-1 text-[0.55rem] uppercase tracking-[0.28em] text-white/55">{t("media.ideasBrandsDigitalGrowth")}</span>}
      </span>
    </span>
  );
}
