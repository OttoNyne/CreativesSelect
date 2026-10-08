import { useState } from "react";
import { REACTIONS, reactionName } from "../../lib/reactions";
import type { ReactionKey, ReactionSummary } from "../../types";
import { t } from "../../i18n";

/**
 * The reactions on a picture or a post: a button for each emoji that has any (with how many, and yours marked), and for someone who can
 * react, a button that opens the six to choose from. Choosing the one you already chose takes it away. Someone who can't react (signed
 * out) sees the counts and nothing to press.
 */
export function ReactionBar({ summary, canReact, onReact, label }: { summary: ReactionSummary; canReact: boolean; onReact: (key: ReactionKey | null) => Promise<void>; label?: string }) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function choose(key: ReactionKey) {
    if (busy) return;
    setPicking(false);
    setBusy(true);
    try {
      await onReact(summary.mine === key ? null : key);
    } finally {
      setBusy(false);
    }
  }

  const groupLabel = label ?? t("reaction.group");
  const shown = REACTIONS.filter((r) => summary.counts[r.key] > 0);
  if (!shown.length && !canReact) return null;
  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap items-center gap-1">
      {shown.map((r) => {
        const mine = summary.mine === r.key;
        const name = reactionName(r.key);
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => choose(r.key)}
            disabled={!canReact || busy}
            aria-pressed={mine}
            aria-label={t(mine ? "reaction.countMine" : "reaction.count", { name, n: String(summary.counts[r.key]) })}
            title={canReact ? (mine ? t("reaction.takeAway", { name }) : t("reaction.reactWith", { name })) : t("reaction.loginToReact")}
            className={`rounded-full border px-2 py-0.5 text-xs disabled:opacity-60 ${mine ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/15 text-white/70 hover:bg-white/10"}`}
          >
            <span aria-hidden="true">{r.emoji}</span> {summary.counts[r.key]}
          </button>
        );
      })}
      {canReact && (
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          disabled={busy}
          aria-expanded={picking}
          aria-label={t("reaction.add")}
          title={t("reaction.add")}
          className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-60"
        >
          <span aria-hidden="true">☺</span>+
        </button>
      )}
      {picking && (
        <div role="group" aria-label={t("reaction.pick")} className="flex basis-full flex-wrap gap-1 pt-1">
          {REACTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => choose(r.key)}
              aria-pressed={summary.mine === r.key}
              aria-label={reactionName(r.key)}
              title={reactionName(r.key)}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-base ${summary.mine === r.key ? "border-violet-400 bg-violet-500/20" : "border-white/15 hover:bg-white/10"}`}
            >
              <span aria-hidden="true">{r.emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
