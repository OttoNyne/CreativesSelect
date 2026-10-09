import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { critiquesApi } from "../../api/critiques.api";
import type { MediaItem } from "../../types";
import { t } from "../../i18n";

/**
 * On a portfolio piece. The owner sees "Ask for feedback" (with a small box for an optional question), or a link to the open request with how
 * many have answered. Someone else signed in sees "Give feedback" when there is an open request.
 */
export function AskFeedback({ item, isOwner, signedIn }: { item: MediaItem; isOwner: boolean; signedIn: boolean }) {
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the request just made from here (the piece list it came from doesn't know about it yet)
  const [made, setMade] = useState<{ id: string; noteCount: number } | null>(null);
  const open = item.critique ?? made;

  if (open) {
    return (
      <Link to={`/critiques/${open.id}`} className="text-[11px] text-white/60 hover:text-white hover:underline">
        {isOwner ? t("critique.requested", { n: open.noteCount }) : signedIn ? t("critique.give") : null}
      </Link>
    );
  }
  if (!isOwner) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { critique } = await critiquesApi.ask(item.id, question.trim() || undefined);
      setMade({ id: critique.id, noteCount: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("critique.failed"));
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} aria-label={t("critique.askTitle")} className="text-[11px] text-white/60 hover:text-white hover:underline">
        {t("critique.ask")}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="basis-full space-y-1.5 py-1">
      <label className="block text-[11px] text-white/70">
        {t("critique.questionLabel")}
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} dir="auto" placeholder={t("critique.questionPlaceholder")} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none" />
      </label>
      {error && (
        <p role="alert" className="text-[11px] text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 text-[11px]">
        <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-2.5 py-1 font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? t("critique.sending") : t("critique.send")}
        </button>
        <button type="button" onClick={() => setAsking(false)} disabled={busy} className="text-white/70 hover:underline disabled:opacity-50">
          {t("critique.cancel")}
        </button>
      </div>
    </form>
  );
}
