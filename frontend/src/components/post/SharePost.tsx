import { useState } from "react";
import { ApiError } from "../../api/client";
import { postsApi } from "../../api/posts.api";
import { MentionTextarea } from "../common/MentionField";
import { t } from "../../i18n";

const MAX = 5000;

/** "Share": put someone else's post on your own feed, with words of your own if you like. The post that is shared is always the original. */
export function SharePost({ postId, onShared }: { postId: string; onShared?: () => void }) {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await postsApi.repost(postId, words.trim());
      setDone(true);
      setOpen(false);
      onShared?.();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("saves.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={done} aria-expanded={open} aria-label={t("post.shareLabel")} className="hover:text-white disabled:opacity-60">
        <span aria-hidden="true">↻</span> {t("post.share")}
      </button>
      {done && (
        <span role="status" className="text-emerald-400">
          {t("post.shared")}
        </span>
      )}
      {open && (
        <form onSubmit={submit} className="w-full basis-full space-y-2">
          <MentionTextarea
            dir="auto"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            maxLength={MAX}
            rows={2}
            placeholder={t("post.shareWords")}
            aria-label={t("post.shareWords")}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {t("post.shareSend")}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-sm text-white/70 hover:underline">
              {t("post.shareCancel")}
            </button>
          </div>
        </form>
      )}
      {problem && (
        <span role="alert" className="basis-full text-red-400">
          {problem}
        </span>
      )}
    </>
  );
}
