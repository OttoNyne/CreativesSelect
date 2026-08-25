import { useState } from "react";
import { aiApi } from "../../api/ai.api";

export function GenerateTextButton({
  kind,
  getPrompt,
  onGenerated,
  label = "Generate with AI",
}: {
  kind: "bio" | "caption" | "blurb";
  getPrompt: () => string;
  onGenerated: (text: string) => void;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const { text } = await aiApi.generateText(getPrompt(), kind);
      onGenerated(text);
    } catch {
      setError("Couldn't generate text, try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
      >
        {loading ? "Generating…" : `✨ ${label}`}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
