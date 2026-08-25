import { useState } from "react";
import { aiApi } from "../../api/ai.api";

export function GenerateImageButton({
  kind,
  getPrompt,
  onGenerated,
  label = "Generate image with AI",
  live = false,
}: {
  kind: "avatar" | "banner" | "wallpaper" | "post";
  getPrompt: () => string;
  onGenerated: (url: string) => void;
  label?: string;
  live?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const { url } = await aiApi.generateImage(getPrompt(), kind, live);
      onGenerated(url);
    } catch {
      setError("Couldn't generate an image, try again.");
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
        className="flex items-center gap-1.5 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50"
      >
        {loading ? (live ? "Animating…" : "Painting…") : `🖼️ ${label}`}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
