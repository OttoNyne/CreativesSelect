import type { ProfileTheme } from "../../types";
import { readableTheme, resolveTheme } from "../../theme/applyProfileTheme";
import { parseColor, toHex } from "../../theme/contrast";

const FONT_OPTIONS = [
  { label: "System sans-serif", value: "system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, serif" },
  { label: "Monospace", value: "'Courier New', monospace" },
  { label: "Rounded (Trebuchet)", value: "'Trebuchet MS', sans-serif" },
];

const LAYOUT_OPTIONS = [
  { label: "Grid", value: "grid" },
  { label: "Stacked", value: "stacked" },
];

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

  function set<K extends keyof ProfileTheme>(key: K, value: ProfileTheme[K]) {
    onChange({ ...theme, [key]: value });
  }

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-black/30 p-4 sm:grid-cols-4">
      <label className="flex flex-col gap-1 text-xs text-white/60">
        Background
        <input
          type="color"
          value={theme.bgColor ?? "#12121a"}
          onChange={(e) => set("bgColor", e.target.value)}
          className="h-8 w-full cursor-pointer rounded"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-white/60">
        Text
        <input
          type="color"
          value={theme.textColor ?? "#f5f5f7"}
          onChange={(e) => set("textColor", e.target.value)}
          className="h-8 w-full cursor-pointer rounded"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-white/60">
        Accent
        <input
          type="color"
          value={theme.accentColor ?? "#8b5cf6"}
          onChange={(e) => set("accentColor", e.target.value)}
          className="h-8 w-full cursor-pointer rounded"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-white/60">
        Font
        <select
          value={theme.fontFamily ?? FONT_OPTIONS[0].value}
          onChange={(e) => set("fontFamily", e.target.value)}
          className="h-8 rounded border border-white/10 bg-black/50 px-1 text-xs text-white"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {textAdjusted && (
        <p role="status" className="col-span-2 text-xs text-amber-300 sm:col-span-4">
          That text colour is too close to the background to read, so visitors will see a slightly lighter or darker shade of it.
        </p>
      )}
      <label className="col-span-2 flex flex-col gap-1 text-xs text-white/60 sm:col-span-4">
        Layout
        <select
          value={theme.layoutStyle ?? "grid"}
          onChange={(e) => set("layoutStyle", e.target.value)}
          className="h-8 rounded border border-white/10 bg-black/50 px-1 text-xs text-white"
        >
          {LAYOUT_OPTIONS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
