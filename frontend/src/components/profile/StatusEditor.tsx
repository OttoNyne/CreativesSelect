import { useEffect, useId, useState } from "react";
import { profilesApi } from "../../api/profiles.api";
import { usePlayback } from "../../context/PlaybackContext";
import { MAX_LISTENING, MAX_MOOD, MAX_TAGS, normalizeTag, tagProblem } from "../../lib/tags";
import { t } from "../../i18n";

const input =
  "w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

/** Edit the mood and "listening to" lines (saved with the rest of the profile). */
export function StatusEditor({ mood, listeningTo, onMood, onListeningTo }: { mood: string; listeningTo: string; onMood: (v: string) => void; onListeningTo: (v: string) => void }) {
  const { current } = usePlayback();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block text-xs text-white/70">
        {t("profile.mood")}
        <input value={mood} onChange={(e) => onMood(e.target.value)} maxLength={MAX_MOOD} placeholder={t("profile.feelingCreative")} className={`${input} mt-1`} />
      </label>
      <label className="block text-xs text-white/70">
        {t("profile.listeningTo")}
        <div className="mt-1 flex gap-1.5">
          <input value={listeningTo} onChange={(e) => onListeningTo(e.target.value)} maxLength={MAX_LISTENING} placeholder={t("profile.songArtistOrAlbum")} className={input} />
          {current && (
            <button
              type="button"
              onClick={() => onListeningTo(current.title.slice(0, MAX_LISTENING))}
              className="shrink-0 rounded-md border border-white/20 px-2 text-xs text-white hover:bg-white/10"
              title={t("profile.useTitle", { title: current.title })}
            >
              {t("profile.useWhatsPlaying")}
            </button>
          )}
        </div>
      </label>
    </div>
  );
}

/** Edit the tags: type one and press Enter or comma; suggestions are what other people use. */
export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const listId = useId();
  const problem = tagProblem(draft, tags);

  useEffect(() => {
    const q = normalizeTag(draft);
    let cancelled = false;
    const timer = setTimeout(
      () =>
        profilesApi
          .tags(q || undefined)
          .then(({ tags: found }) => !cancelled && setSuggestions(found.map((t) => t.tag).filter((t) => !tags.includes(t))))
          .catch(() => !cancelled && setSuggestions([])),
      q ? 250 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, tags]);

  function add(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag || tagProblem(raw, tags)) return;
    onChange([...tags, tag]);
    setDraft("");
  }

  return (
    <div className="text-xs text-white/70">
      <label htmlFor={listId + "-input"}>{t("profile.tagsPrompt", { n: tags.length, max: MAX_TAGS })}</label>
      <ul aria-label={t("profile.yourTags")} className="mt-1 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li key={tag} className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 py-0.5 ps-2.5 pe-1 text-xs text-white">
            #{tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} aria-label={t("profile.removeTag", { tag })} className="rounded-full px-1.5 text-white/70 hover:bg-white/10 hover:text-white">
              ✕
            </button>
          </li>
        ))}
      </ul>
      {tags.length < MAX_TAGS && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            id={listId + "-input"}
            value={draft}
            onChange={(e) => {
              // a comma finishes a tag, as Enter does
              const text = e.target.value;
              if (text.includes(",")) {
                const [first, ...rest] = text.split(",");
                add(first);
                setDraft(rest.join(","));
              } else setDraft(text);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
            }}
            placeholder={t("profile.illustratorLoFiProducer")}
            list={listId}
            maxLength={40}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? listId + "-problem" : undefined}
            className={input}
          />
          <button type="button" onClick={() => add(draft)} disabled={!draft.trim() || Boolean(problem)} className="shrink-0 rounded-md border border-white/20 px-3 text-xs text-white hover:bg-white/10 disabled:opacity-50">
            {t("profile.addTag")}
          </button>
          <datalist id={listId}>
            {suggestions.slice(0, 8).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      )}
      {problem && (
        <p id={listId + "-problem"} role="alert" className="mt-1 text-red-400">
          {problem}
        </p>
      )}
    </div>
  );
}
