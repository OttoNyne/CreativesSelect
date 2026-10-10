import { useState } from "react";
import { ApiError } from "../../api/client";
import { scheduledPostsApi } from "../../api/scheduledPosts.api";
import { earliestStart, formatWhen, toLocalInput } from "../../lib/when";
import type { Post, ScheduledPost } from "../../types";
import { t, translateServerMessage } from "../../i18n";

const small = "rounded-md border border-white/20 px-2.5 py-1 text-xs text-white/90 hover:bg-white/10 disabled:opacity-50";

/**
 * The posts this person asked to be published later, soonest first: when each goes out, its words, and what can be done (change the words or
 * the time, publish now, take it back). One that couldn't be published says so and waits for a new time.
 */
export function ScheduledPosts({ items, onChange, onPublished }: { items: ScheduledPost[]; onChange: (items: ScheduledPost[]) => void; onPublished: (post: Post) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (items.length === 0) return null;

  const run = async (id: string, work: () => Promise<void>) => {
    setBusy(id);
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("schedule.actionFailed"));
    } finally {
      setBusy(null);
    }
  };
  const replace = (next: ScheduledPost) => onChange(items.map((i) => (i.id === next.id ? next : i)).sort((a, b) => a.publishAt.localeCompare(b.publishAt)));

  function startEditing(item: ScheduledPost) {
    setEditing(item.id);
    setWords(item.content);
    setWhen(toLocalInput(item.publishAt));
    setProblem(null);
  }

  async function save(item: ScheduledPost) {
    const at = new Date(when);
    if (!when || Number.isNaN(at.getTime())) return setProblem(t("schedule.needTime"));
    await run(item.id, async () => {
      const changes: { content?: string; publishAt?: string } = {};
      if (words.trim() !== item.content) changes.content = words.trim();
      if (at.toISOString() !== new Date(item.publishAt).toISOString()) changes.publishAt = at.toISOString();
      if (Object.keys(changes).length) replace((await scheduledPostsApi.update(item.id, changes)).post);
      setEditing(null);
    });
  }

  return (
    <section aria-label={t("schedule.heading", { n: items.length })} className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-2.5 text-start text-sm font-medium text-white">
        <span>{t("schedule.heading", { n: items.length })}</span>
        <span aria-hidden="true" className="text-white/60">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/10 p-3">
          {problem && (
            <p role="alert" className="text-xs text-red-400">
              {problem}
            </p>
          )}
          <ul className="space-y-3">
            {items.map((item) => {
              const label = formatWhen(item.publishAt);
              const isBusy = busy === item.id;
              return (
                <li key={item.id} className="space-y-2 rounded-lg border border-white/10 p-3">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-white/70">
                    <span className="font-medium text-white">{label}</span>
                    {item.imageUrl && <span>· {t("schedule.withPicture")}</span>}
                    {item.poll && <span>· {t("schedule.withPoll")}</span>}
                    {item.failed && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-200">{t("schedule.couldntPublish")}</span>}
                  </p>
                  {item.failed && (
                    <p className="text-xs text-red-300">
                      {translateServerMessage(item.failure)} {t("schedule.chooseNew")}
                    </p>
                  )}
                  {editing === item.id ? (
                    <div className="space-y-2">
                      <label className="block text-xs text-white/70">
                        {t("schedule.words")}
                        <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3} dir="auto" className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none" />
                      </label>
                      <label className="block text-xs text-white/70">
                        {t("schedule.newTime")}
                        <input type="datetime-local" value={when} min={earliestStart()} onChange={(e) => setWhen(e.target.value)} className="mt-1 block w-full max-w-xs rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none" />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" disabled={isBusy || !words.trim()} onClick={() => save(item)} className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                          {t("schedule.save")}
                        </button>
                        <button type="button" disabled={isBusy} onClick={() => setEditing(null)} className={small}>
                          {t("schedule.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p dir="auto" className="whitespace-pre-line break-words text-sm text-white/90">
                        {item.content}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={isBusy} onClick={() => startEditing(item)} aria-label={t("schedule.editLabel", { when: label })} className={small}>
                          {t("schedule.edit")}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          aria-label={t("schedule.postNowLabel", { when: label })}
                          onClick={() =>
                            run(item.id, async () => {
                              const { post } = await scheduledPostsApi.publishNow(item.id);
                              onChange(items.filter((i) => i.id !== item.id));
                              onPublished(post);
                            })
                          }
                          className={small}
                        >
                          {t("schedule.postNow")}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          aria-label={t("schedule.removeLabel", { when: label })}
                          onClick={() =>
                            window.confirm(t("schedule.confirmRemove")) &&
                            void run(item.id, async () => {
                              await scheduledPostsApi.remove(item.id);
                              onChange(items.filter((i) => i.id !== item.id));
                            })
                          }
                          className={`${small} hover:text-red-400`}
                        >
                          {t("schedule.remove")}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
