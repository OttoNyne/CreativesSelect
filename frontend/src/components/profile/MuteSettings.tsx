import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { mutesApi, type MutedPerson } from "../../api/mutes.api";
import { t } from "../../i18n";

const MAX_WORDS = 30;
const MAX_WORD = 40;

/** In the owner's settings: the words and phrases they have muted (add, remove) and the people (with a way to unmute). Private to them. */
export function MuteSettings() {
  const [words, setWords] = useState<string[] | null>(null);
  const [people, setPeople] = useState<MutedPerson[]>([]);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    mutesApi
      .list()
      .then((r) => {
        if (!current) return;
        setWords(r.words);
        setPeople(r.people);
      })
      .catch((err) => current && setProblem(err instanceof ApiError ? err.message : t("mutes.loadFailed")));
    return () => {
      current = false;
    };
  }, []);

  async function saveWords(next: string[]) {
    setBusy(true);
    setProblem(null);
    try {
      const saved = await mutesApi.setWords(next);
      setWords(saved.words);
      return true;
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("mutes.failed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addWord(e: React.FormEvent) {
    e.preventDefault();
    const word = draft.trim();
    if (!word || busy || !words) return;
    if (await saveWords([...words, word])) setDraft("");
  }

  async function unmute(person: MutedPerson) {
    setProblem(null);
    try {
      await mutesApi.unmute(person.username);
      setPeople((list) => list.filter((p) => p.id !== person.id));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("mutes.failed"));
    }
  }

  const small = "rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50";
  return (
    <section aria-label={t("mutes.title")} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("mutes.title")}</h3>
      <p className="text-xs text-white/60">{t("mutes.intro")}</p>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-white/70">{t("mutes.words")}</p>
        <form onSubmit={addWord} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_WORD}
            dir="auto"
            aria-label={t("mutes.wordLabel")}
            placeholder={t("mutes.wordLabel")}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" disabled={busy || !draft.trim() || !words || words.length >= MAX_WORDS} className={small}>
            {t("mutes.addWord")}
          </button>
        </form>
        {words && words.length === 0 && <p className="text-xs text-white/60">{t("mutes.noWords")}</p>}
        {words && words.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {words.map((word) => (
              <li key={word} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pe-1 ps-2.5 text-xs text-white">
                <bdi>{word}</bdi>
                <button type="button" disabled={busy} onClick={() => saveWords(words.filter((w) => w !== word))} aria-label={t("mutes.removeWord", { word })} className="rounded-full px-1.5 text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-50">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-white/70">{t("mutes.people")}</p>
        {words && people.length === 0 && <p className="text-xs text-white/60">{t("mutes.noPeople")}</p>}
        <ul className="space-y-1">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-2 text-sm">
              <Link to={`/u/${person.username}`} className="min-w-0 flex-1 truncate text-white hover:underline">
                {person.displayName} <bdi className="text-xs text-white/60">@{person.username}</bdi>
              </Link>
              <button type="button" onClick={() => unmute(person)} aria-label={t("mutes.unmuteLabel", { name: person.displayName })} className={small}>
                {t("mutes.unmute")}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}
