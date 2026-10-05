import { useRef, useState } from "react";
import { uploadFile } from "../../api/media.api";
import { aiApi } from "../../api/ai.api";
import { ApiError, assetUrl } from "../../api/client";

export const COMMENT_PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_COMMENT_PICTURE_BYTES = 5 * 1024 * 1024;

/**
 * Attach one picture (or GIF) to a comment being written: it is uploaded here when chosen, shown as a small preview with a Remove
 * button, and `url` is what to send with the comment. Removing it before posting also removes the stored file, so nothing is left behind.
 */
export function CommentPicturePicker({ url, onChange, disabled = false }: { url: string | null; onChange: (url: string | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setError(null);
    if (!COMMENT_PICTURE_TYPES.includes(file.type)) return setError("Choose a PNG, JPEG, WebP or GIF picture.");
    if (file.size > MAX_COMMENT_PICTURE_BYTES) return setError("Pictures in comments can be up to 5 MB.");
    setBusy(true);
    try {
      if (url) void aiApi.discard(url); // replacing a picture that wasn't posted yet
      const uploaded = await uploadFile(file, "comments");
      onChange(uploaded.url);
    } catch (err) {
      onChange(null);
      setError(err instanceof ApiError ? err.message : "Couldn't upload that picture.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (url) void aiApi.discard(url); // not posted: take the stored file out again
    onChange(null);
    setError(null);
  }

  const src = assetUrl(url);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept={COMMENT_PICTURE_TYPES.join(",")} onChange={choose} className="hidden" aria-label="Choose a picture for your comment" />
      {src ? (
        <span className="flex items-center gap-2">
          <img src={src} alt="Picture to post with your comment" className="h-12 w-12 rounded-md border border-white/10 object-cover" />
          <button type="button" onClick={remove} disabled={disabled || busy} className="text-xs text-white/70 hover:text-white hover:underline disabled:opacity-50">
            Remove picture
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={disabled || busy} className="text-xs text-white/70 hover:text-white hover:underline disabled:opacity-50">
          {busy ? "Uploading…" : "📎 Add a picture"}
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}
