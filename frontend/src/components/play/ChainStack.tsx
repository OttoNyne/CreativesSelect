import { Link } from "react-router-dom";
import type { ChainPart } from "../../api/chains.api";
import { API_BASE } from "../../api/base";
import { t } from "../../i18n";

/**
 * The parts of a finished chain one above the other, seamless, as the whole drawing. With `reveal` each part arrives a moment after the one
 * above (the "ta-da"); the motion stops for people who ask their device for less.
 */
export function ChainStack({ parts, reveal = false }: { parts: ChainPart[]; reveal?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/15 bg-[#fffdf8]">
      {parts.map((part, i) => (
        <img
          key={part.id}
          src={`${API_BASE}${part.imageUrl}`}
          alt={part.author ? t("chain.partAlt", { n: part.index + 1, name: part.author.displayName }) : t("chain.partAltAnon", { n: part.index + 1 })}
          loading="lazy"
          className={`block w-full ${reveal ? "cs-fade-in" : ""}`}
          style={reveal ? { animationDelay: `${i * 450}ms` } : undefined}
        />
      ))}
    </div>
  );
}

/** Who drew what, as a short list under a finished chain. */
export function ChainCredits({ parts }: { parts: ChainPart[] }) {
  return (
    <p className="text-xs text-white/70">
      {t("chain.drawnBy")}{" "}
      {parts.map((part, i) => (
        <span key={part.id}>
          {i > 0 && ", "}
          {part.author ? (
            <Link to={`/u/${part.author.username}`} className="text-violet-300 hover:underline">
              {part.author.displayName}
            </Link>
          ) : (
            t("chain.partAltAnon", { n: part.index + 1 })
          )}
        </span>
      ))}
    </p>
  );
}
