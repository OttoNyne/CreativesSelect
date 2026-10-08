import { useId } from "react";
import { t } from "../../i18n";

/**
 * The CSverified badge, shown next to a name: given by an administrator, or earned by having 1,000 active friends. Draws nothing for
 * anyone who doesn't have it, so it can be placed beside every name without checking first.
 */
export function CSBadge({ verified, size = 16, withLabel = false, className = "" }: { verified?: boolean; size?: number; withLabel?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (!verified) return null;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`} title={t("media.csverifiedGivenByCreativesselect")}>
      <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={t("media.csverified")} focusable="false" className="shrink-0">
        <defs>
          <linearGradient id={`${id}b`} x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#67e8f9" />
            <stop offset="0.5" stopColor="#818cf8" />
            <stop offset="1" stopColor="#e879f9" />
          </linearGradient>
        </defs>
        {/* a seal with eight soft points, and a tick */}
        <path d="M12 1.5l2.3 1.9 3-.2 1 2.8 2.7 1.4-.6 3 1.5 2.6-2 2.3.1 3-2.9.8-1.7 2.5-2.8-1.1-2.8 1.1-1.7-2.5-2.9-.8.1-3-2-2.3 1.5-2.6-.6-3 2.7-1.4 1-2.8 3 .2z" fill={`url(#${id}b)`} />
        <path d="M7.6 12.4l3 3 5.9-6.2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withLabel && <span className="text-xs font-semibold text-cyan-200">{t("media.csverified")}</span>}
    </span>
  );
}
