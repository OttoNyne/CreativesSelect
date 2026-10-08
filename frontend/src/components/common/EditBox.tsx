import { useState } from "react";
import { t } from "../../i18n";

interface Props {
  /** The words as they are now. */
  text: string;
  maxText: number;
  /** Name for the text box, for screen readers ("Edit post", "Edit reply"). */
  label: string;
  /** For things with a title as well as text (a bulletin, a board topic). */
  title?: string;
  maxTitle?: number;
  rows?: number;
  /** Saves the change. Returns a message if it couldn't be saved, or null when it was. */
  onSave: (value: { text: string; title?: string }) => Promise<string | null>;
  onCancel: () => void;
}

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

/** Change something you wrote, in place: the same words in a box, with Save and Cancel and the reason if it can't be saved. */
export function EditBox({ text, maxText, label, title, maxTitle, rows = 4, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState(text);
  const [titleDraft, setTitleDraft] = useState(title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasTitle = title !== undefined;
  const unchanged = draft === text && (!hasTitle || titleDraft === title);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (hasTitle && !titleDraft.trim()) return setError(t("edit.needTitle"));
    if (!draft.trim()) return setError(t("edit.needText"));
    setBusy(true);
    setError(null);
    const problem = await onSave({ text: draft, ...(hasTitle ? { title: titleDraft } : {}) });
    if (problem) {
      setError(problem);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      {hasTitle && <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} maxLength={maxTitle} aria-label={t("edit.titleLabel", { label })} className={field} />}
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={maxText} rows={rows} aria-label={label} className={field} autoFocus />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || unchanged} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-white/70 hover:underline disabled:opacity-50">
          {t("common.cancel")}
        </button>
        <span className="ms-auto text-xs text-white/60" aria-live="polite">
          {draft.length} / {maxText}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
