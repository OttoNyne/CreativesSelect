import { useEffect, useState } from "react";
import { ApiError, assetUrl } from "../../api/client";
import { processApi } from "../../api/process.api";
import type { MediaItem, ProcessStep } from "../../types";
import { CommentPicturePicker } from "../common/CommentPicturePicker";
import { EditBox } from "../common/EditBox";
import { Linkified } from "../common/Linkified";
import { t } from "../../i18n";

export const MAX_STEPS = 12;
const MAX_STEP = 500;

const small = "rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40";

/**
 * How a portfolio piece was made. Anyone who can see the piece walks through its steps one at a time, ending on the finished piece. Its owner
 * also sees their steps as a list to add to, change, put in order and take away.
 */
export function ProcessTimeline({ piece, isOwner, onCountChange }: { piece: MediaItem; isOwner: boolean; onCountChange: (count: number) => void }) {
  const [steps, setSteps] = useState<ProcessStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    processApi
      .steps(piece.id)
      .then((r) => current && setSteps(r.steps))
      .catch((err) => {
        if (!current) return;
        setSteps([]);
        setProblem(err instanceof ApiError ? err.message : t("process.loadFailed"));
      });
    return () => {
      current = false;
    };
  }, [piece.id]);

  const fail = (err: unknown) => setProblem(err instanceof ApiError ? err.message : t("process.failed"));
  function change(next: ProcessStep[]) {
    setSteps(next);
    onCountChange(next.length);
    setIndex((i) => Math.min(i, next.length)); // the last frame is the finished piece
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!steps || adding) return;
    if (!draft.trim() && !picture) return setProblem(t("process.needSomething"));
    setAdding(true);
    setProblem(null);
    try {
      const { step } = await processApi.add(piece.id, { ...(draft.trim() ? { content: draft.trim() } : {}), ...(picture ? { imageUrl: picture } : {}) });
      change([...steps, step]);
      setIndex(steps.length); // show the step just added
      setDraft("");
      setPicture(null);
    } catch (err) {
      fail(err);
    } finally {
      setAdding(false);
    }
  }

  async function saveWords(step: ProcessStep, text: string): Promise<string | null> {
    try {
      const { step: saved } = await processApi.setWords(step.id, text);
      setSteps((list) => (list ?? []).map((s) => (s.id === step.id ? saved : s)));
      setEditing(null);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : t("process.failed");
    }
  }

  async function takePictureOff(step: ProcessStep) {
    setProblem(null);
    try {
      const { step: saved } = await processApi.removePicture(step.id);
      setSteps((list) => (list ?? []).map((s) => (s.id === step.id ? saved : s)));
    } catch (err) {
      fail(err);
    }
  }

  async function remove(step: ProcessStep) {
    if (!steps || !window.confirm(t("process.confirmDelete"))) return;
    setProblem(null);
    try {
      await processApi.remove(step.id);
      change(steps.filter((s) => s.id !== step.id));
    } catch (err) {
      fail(err);
    }
  }

  async function move(from: number, to: number) {
    if (!steps || to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[from], next[to]] = [next[to], next[from]];
    setProblem(null);
    try {
      const saved = await processApi.reorder(piece.id, next.map((s) => s.id));
      setSteps(saved.steps);
    } catch (err) {
      fail(err);
    }
  }

  if (!steps) return <p className="p-3 text-xs text-white/60">{t("common.loading")}</p>;
  const finalFrame = index >= steps.length;
  const step = finalFrame ? null : steps[index];
  const frames = steps.length + 1;

  return (
    <section aria-label={t("process.heading")} className="space-y-3 border-t border-white/10 bg-black/20 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("process.heading")}</h3>

      {steps.length > 0 && (
        <div className="space-y-2">
          <p aria-live="polite" className="text-sm font-medium text-white">
            {finalFrame ? t("process.finished") : t("process.stepOf", { n: index + 1, total: steps.length })}
          </p>
          <div className="min-h-24 space-y-2">
            {step && (
              <>
                {step.imageUrl && <img src={assetUrl(step.imageUrl)} alt={t("process.picture", { n: index + 1 })} className="max-h-72 max-w-full rounded-md border border-white/10 object-contain" />}
                {step.content && (
                  <p dir="auto" className="whitespace-pre-line break-words text-sm text-white/85">
                    <Linkified text={step.content} />
                  </p>
                )}
              </>
            )}
            {finalFrame && (
              <>
                {piece.type === "image" && <img src={assetUrl(piece.url)} alt={piece.caption ?? t("process.finished")} className="max-h-72 max-w-full rounded-md border border-white/10 object-contain" />}
                <p className="text-sm text-white/70">{t("process.finishedNote")}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label={t("process.prev")} className={small}>
              <span aria-hidden="true" className="inline-block rtl:rotate-180">◀</span>
            </button>
            <ol className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: frames }, (_, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={i === steps.length ? t("process.goFinal") : t("process.goTo", { n: i + 1 })}
                    aria-current={i === index ? "step" : undefined}
                    className={`h-3 w-3 rounded-full border border-white/40 ${i === index ? "bg-white" : "bg-transparent hover:bg-white/30"}`}
                  />
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setIndex(index + 1)} disabled={finalFrame} aria-label={t("process.next")} className={small}>
              <span aria-hidden="true" className="inline-block rtl:rotate-180">▶</span>
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("process.manage")}</h4>
          {steps.length === 0 && <p className="text-xs text-white/60">{t("process.hint")}</p>}
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.id} className="rounded-md border border-white/10 p-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-5 shrink-0 text-xs text-white/60">{i + 1}.</span>
                  {s.imageUrl && <img src={assetUrl(s.imageUrl)} alt={t("process.picture", { n: i + 1 })} className="h-10 w-10 shrink-0 rounded border border-white/10 object-cover" />}
                  <div className="min-w-0 flex-1">
                    {editing === s.id ? (
                      <EditBox text={s.content} maxText={MAX_STEP} label={t("process.editLabel", { n: i + 1 })} rows={3} onSave={({ text }) => saveWords(s, text)} onCancel={() => setEditing(null)} />
                    ) : (
                      <p dir="auto" className="break-words text-white/85">
                        {s.content || <span className="text-white/50">…</span>}
                      </p>
                    )}
                  </div>
                </div>
                {editing !== s.id && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setEditing(s.id)} aria-label={s.content ? t("process.editStep", { n: i + 1 }) : t("process.addWords", { n: i + 1 })} className={small}>
                      {t("common.edit")}
                    </button>
                    {s.imageUrl && s.content && (
                      <button type="button" onClick={() => takePictureOff(s)} className={small}>
                        {t("comments.removePicture")}
                      </button>
                    )}
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t("process.moveUp", { n: i + 1 })} className={small}>
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === steps.length - 1} aria-label={t("process.moveDown", { n: i + 1 })} className={small}>
                      ↓
                    </button>
                    <button type="button" onClick={() => remove(s)} aria-label={t("process.removeStep", { n: i + 1 })} className={`${small} hover:text-red-400`}>
                      {t("common.delete")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {steps.length < MAX_STEPS && (
            <form onSubmit={add} className="space-y-2">
              <label className="block text-xs font-medium text-white/70" htmlFor={`new-step-${piece.id}`}>
                {t("process.newStep")}
              </label>
              <textarea
                id={`new-step-${piece.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_STEP}
                rows={2}
                dir="auto"
                aria-label={t("process.wordsLabel")}
                placeholder={t("process.wordsPlaceholder")}
                className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
              />
              <CommentPicturePicker url={picture} onChange={setPicture} disabled={adding} />
              <button type="submit" disabled={adding} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                {adding ? t("process.adding") : t("process.addButton")}
              </button>
            </form>
          )}
        </div>
      )}
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}
