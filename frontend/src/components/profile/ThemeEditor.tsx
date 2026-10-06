import type { ProfileTheme } from "../../types";
import { readableTheme, resolveTheme } from "../../theme/applyProfileTheme";
import { parseColor, toHex } from "../../theme/contrast";
import { FONT_OPTIONS, PRESETS, STYLE_KEYS, STYLE_OPTIONS, applyPreset, matchingPreset, styleValue, type StyleKey } from "../../lib/profileStyle";

const select = "h-8 rounded border border-white/10 bg-black/50 px-1 text-xs text-white";

export function ThemeEditor({
  theme,
  onChange,
  hasWallpaper = false,
}: {
  theme: ProfileTheme;
  onChange: (theme: ProfileTheme) => void;
  /** With a wallpaper the page darkens it, so the text is checked against that instead of the background colour. */
  hasWallpaper?: boolean;
}) {
  // The page never shows text a visitor can't read: if the chosen text colour is too close to the background it is nudged.
  const chosenText = toHex(parseColor(resolveTheme(theme).textColor) ?? [245, 245, 247]);
  const textAdjusted = readableTheme(theme, hasWallpaper).text !== chosenText;
  const preset = matchingPreset(theme);

  function set<K extends keyof ProfileTheme>(key: K, value: ProfileTheme[K]) {
    onChange({ ...theme, [key]: value });
  }

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Background
          <input type="color" value={theme.bgColor ?? "#12121a"} onChange={(e) => set("bgColor", e.target.value)} className="h-8 w-full cursor-pointer rounded" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Text
          <input type="color" value={theme.textColor ?? "#f5f5f7"} onChange={(e) => set("textColor", e.target.value)} className="h-8 w-full cursor-pointer rounded" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Accent
          <input type="color" value={theme.accentColor ?? "#8b5cf6"} onChange={(e) => set("accentColor", e.target.value)} className="h-8 w-full cursor-pointer rounded" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Font
          <select value={theme.fontFamily ?? FONT_OPTIONS[0].value} onChange={(e) => set("fontFamily", e.target.value)} className={select}>
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {textAdjusted && (
        <p role="status" className="text-xs text-amber-300">
          That text colour is too close to the background to read, so visitors will see a slightly lighter or darker shade of it.
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs text-white/60">Start from a look</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onChange(applyPreset(theme, p))}
              aria-pressed={preset?.name === p.name}
              title={p.hint}
              className={`rounded-full border px-3 py-1 text-xs ${preset?.name === p.name ? "border-[var(--profile-accent)] bg-white/10 text-white" : "border-white/20 text-white/80 hover:bg-white/10"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset && <p className="text-[11px] text-white/60">{preset.hint}. Change any of the choices below to make it your own.</p>}
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {STYLE_KEYS.map((key: StyleKey) => (
          <label key={key} className="flex flex-col gap-1 text-xs text-white/60">
            {STYLE_OPTIONS[key].label}
            <select value={styleValue(theme, key)} onChange={(e) => set(key, e.target.value)} className={select}>
              {STYLE_OPTIONS[key].choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-white/60">However you style it, the text is kept readable, and on a wallpaper every box keeps a dark tint.</p>
    </div>
  );
}
