import { useState } from "react";
import { aiApi, type WallpaperCloseness } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import { ReferencePhotoField } from "./ReferencePhotoField";
import { shrinkForUpload } from "../../lib/resizeImage";
import { t } from "../../i18n";

/**
 * "Generate image with AI" from the description in the box next to it. A reference photo can be added to start from: the AI
 * then reshapes the photo to match the description (and says how closely it follows it) instead of drawing from words alone.
 */
export function GenerateImageButton({
  kind,
  getPrompt,
  onGenerated,
  label,
}: {
  kind: "avatar" | "wallpaper" | "post";
  getPrompt: () => string;
  onGenerated: (url: string) => void;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [closeness, setCloseness] = useState<WallpaperCloseness>("balanced");
  const [showReference, setShowReference] = useState(false);
  const isEmpty = !getPrompt().trim();

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const options = reference ? { reference: await shrinkForUpload(reference), closeness } : undefined;
      const { url } = options ? await aiApi.generateImage(getPrompt(), kind, options) : await aiApi.generateImage(getPrompt(), kind);
      onGenerated(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("ai.imageFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || isEmpty}
        title={isEmpty ? t("ai.typeDescription") : undefined}
        className="flex items-center gap-1.5 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50"
      >
        {loading ? (reference ? t("ai.reworking") : t("ai.painting")) : `🖼️ ${label ?? t("ai.generateImage")}`}
      </button>
      {!showReference && !reference && (
        <button
          type="button"
          onClick={() => setShowReference(true)}
          disabled={loading}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 disabled:opacity-50"
        >
          {t("ai.startFromPhoto")}
        </button>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
      {(showReference || reference) && (
        <div className="basis-full">
          <ReferencePhotoField file={reference} onFile={setReference} closeness={closeness} onCloseness={setCloseness} disabled={loading} label={t("ai.chooseReference")} />
        </div>
      )}
    </div>
  );
}
