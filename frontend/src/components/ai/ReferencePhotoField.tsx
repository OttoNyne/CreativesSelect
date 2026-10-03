import { useEffect, useId, useRef, useState } from "react";
import type { WallpaperCloseness } from "../../api/ai.api";

export const CLOSENESS_CHOICES: { value: WallpaperCloseness; label: string }[] = [
  { value: "close", label: "Stay close to my photo" },
  { value: "balanced", label: "Balanced" },
  { value: "loose", label: "Just inspired by it" },
];

const chip = (on: boolean) =>
  `rounded-md border px-3 py-1.5 text-xs font-medium ${on ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/15 text-white/70 hover:bg-white/10"}`;

/**
 * Lets a person add a reference photo for an AI picture — optional — and say how closely the AI should follow it. It only
 * holds the choice; whoever uses it sends the photo along with the description. Used by every AI picture maker on the site.
 */
export function ReferencePhotoField({
  file,
  onFile,
  closeness,
  onCloseness,
  disabled = false,
  label = "📷 Add a reference photo (optional)",
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  closeness: WallpaperCloseness;
  onCloseness: (closeness: WallpaperCloseness) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const group = useId();

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen) return;
    if (!chosen.type.startsWith("image/")) return setProblem("Choose a picture (JPEG, PNG or WebP) for the reference.");
    setProblem(null);
    onFile(chosen);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={disabled} className={chip(false)}>
          {file ? "Change reference photo" : label}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" aria-label="Reference photo" className="hidden" onChange={pick} />
        {file && preview && (
          <>
            <img src={preview} alt="Your reference photo" className="h-10 w-16 rounded object-cover" />
            <button type="button" onClick={() => onFile(null)} disabled={disabled} className="text-xs text-white/70 hover:text-red-400">
              Remove photo
            </button>
          </>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
      {file && (
        <fieldset disabled={disabled}>
          <legend className="text-xs text-white/70">How closely should it follow your photo?</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {CLOSENESS_CHOICES.map((c) => (
              <label key={c.value} className={`${chip(closeness === c.value)} cursor-pointer`}>
                <input type="radio" name={`closeness-${group}`} value={c.value} checked={closeness === c.value} onChange={() => onCloseness(c.value)} className="sr-only" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
