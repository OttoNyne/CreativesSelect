import { useState } from "react";
import { ApiError } from "../../api/client";
import { postsApi } from "../../api/posts.api";
import { t } from "../../i18n";

export const MAX_ALT = 300;

/**
 * The owner's way to add or change the description of a post's picture (the words a screen reader says, and what shows if the picture
 * can't load). Says so when it can't be saved.
 */
export function PictureDescription({ postId, value, onSaved }: { postId: string; value: string; onSaved: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { post } = await postsApi.setPictureDescription(postId, draft.trim());
      onSaved(post.imageAlt ?? "");
      setOpen(false);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("common.saveChangeFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
        className="hover:text-white"
      >
        {value ? t("post.editPictureDescription") : t("post.addPictureDescription")}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="w-full basis-full space-y-2">
      <label className="block text-xs text-white/70">
        {t("post.pictureDescriptionLabel")}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_ALT}
          dir="auto"
          placeholder={t("composer.pictureDescriptionPlaceholder")}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {t("common.save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-sm text-white/70 hover:underline">
          {t("post.shareCancel")}
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </form>
  );
}
