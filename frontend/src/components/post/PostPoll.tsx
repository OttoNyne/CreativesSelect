import { useState } from "react";
import { ApiError } from "../../api/client";
import { postsApi } from "../../api/posts.api";
import { useAuth } from "../../context/AuthContext";
import { daysLeft } from "../../lib/when";
import { locale, t } from "../../i18n";
import type { PostPoll as Poll } from "../../types";

/**
 * A post's poll. Someone who hasn't voted (and can) sees the options as buttons; once they have voted, or it has closed, or they aren't signed in,
 * they see how it stands: each option's share as a bar, which one they chose, the number of votes and how long is left. A vote is final.
 */
export function PostPoll({ postId, poll: first }: { postId: string; poll: Poll }) {
  const { user } = useAuth();
  const [poll, setPoll] = useState(first);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const voting = Boolean(user) && !poll.closed && poll.myVote === null;

  async function vote(option: number) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await postsApi.vote(postId, option);
      setPoll(result.poll);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("polls.failed"));
    } finally {
      setBusy(false);
    }
  }

  const percent = new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 });
  return (
    <div role="group" aria-label={t("polls.heading")} className="mt-3 space-y-2">
      {poll.options.map((option, i) =>
        voting ? (
          <button
            key={i}
            type="button"
            disabled={busy}
            onClick={() => vote(i)}
            aria-label={t("polls.voteFor", { option: option.text })}
            className="block w-full rounded-lg border border-white/20 px-3 py-2 text-start text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            <span dir="auto" className="break-words">
              {option.text}
            </span>
          </button>
        ) : (
          <div key={i} className="relative overflow-hidden rounded-lg border border-white/10 text-sm">
            <div aria-hidden="true" className={`absolute inset-y-0 start-0 ${poll.myVote === i ? "bg-violet-500/40" : "bg-white/10"}`} style={{ width: `${poll.total ? (option.votes / poll.total) * 100 : 0}%` }} />
            <div className="relative flex items-center gap-2 px-3 py-2 text-white">
              <span dir="auto" className="min-w-0 flex-1 break-words">
                {option.text}
                {poll.myVote === i && (
                  <span className="ms-1.5 text-xs text-violet-200">
                    <span aria-hidden="true">✓</span> {t("polls.yourVote")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-white/80">{percent.format(poll.total ? option.votes / poll.total : 0)}</span>
            </div>
          </div>
        )
      )}
      <p className="text-xs text-white/60">
        {t("polls.votes", { n: poll.total })} · {poll.closed ? t("polls.final") : daysLeft(poll.endsAt)}
      </p>
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </div>
  );
}
