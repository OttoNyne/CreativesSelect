import { LANGUAGES, language, setLanguage, t, type Language } from "../../i18n";

/** Picks the language of the site. Each language is named in itself, so someone who can't read the current one can still find theirs. Changing it reloads the page. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span>{t("language.label")}</span>
      <select
        value={language()}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-white/80 hover:bg-white/10 focus:border-violet-500 focus:outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code} className="bg-[#0e0e12] text-white">
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
