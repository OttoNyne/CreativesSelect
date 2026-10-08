import { useState } from "react";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import { t } from "../../i18n";

export function GenerateTextButton({
  kind,
  getPrompt,
  onGenerated,
  label,
}: {
  kind: "bio" | "caption" | "blurb";
  getPrompt: () => string;
  onGenerated: (text: string) => void;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEmpty = !getPrompt().trim();

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const { text } = await aiApi.generateText(getPrompt(), kind);
      onGenerated(text);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("ai.textFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || isEmpty}
        title={isEmpty ? t("ai.typeFirst") : undefined}
        className="flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
      >
        {loading ? t("ai.generating") : `✨ ${label ?? t("ai.generateText")}`}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
