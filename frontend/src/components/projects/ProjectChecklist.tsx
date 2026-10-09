import { useState } from "react";
import { ApiError } from "../../api/client";
import { projectsApi } from "../../api/projects.api";
import type { ProjectTask } from "../../types";
import { t } from "../../i18n";

const MAX_TASK = 120;

/** A room's checklist: any member adds a line and ticks it off; whoever added it (or the room's owner) can take it away. */
export function ProjectChecklist({ projectId, tasks, onChange, archived, isOwner, myId }: { projectId: string; tasks: ProjectTask[]; onChange: (tasks: ProjectTask[]) => void; archived: boolean; isOwner: boolean; myId: string }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fail = (err: unknown) => setProblem(err instanceof ApiError ? err.message : t("projects.failed"));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { task } = await projectsApi.addTask(projectId, draft.trim());
      onChange([...tasks, task]);
      setDraft("");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(task: ProjectTask) {
    setProblem(null);
    try {
      const { task: saved } = await projectsApi.setTask(projectId, task.id, { done: !task.done });
      onChange(tasks.map((x) => (x.id === task.id ? saved : x)));
    } catch (err) {
      fail(err);
    }
  }

  async function remove(task: ProjectTask) {
    setProblem(null);
    try {
      await projectsApi.removeTask(projectId, task.id);
      onChange(tasks.filter((x) => x.id !== task.id));
    } catch (err) {
      fail(err);
    }
  }

  return (
    <section aria-label={t("projects.checklist")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium text-white">{t("projects.checklist")}</h2>
      {tasks.length === 0 && <p className="text-xs text-white/60">{t("projects.noTasks")}</p>}
      <ul className="space-y-1.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={task.done} disabled={archived} onChange={() => toggle(task)} aria-label={task.done ? t("projects.untick", { text: task.text }) : t("projects.tick", { text: task.text })} className="mt-1 h-4 w-4 shrink-0 accent-violet-500" />
            <span dir="auto" className={`min-w-0 flex-1 break-words ${task.done ? "text-white/50 line-through" : "text-white/90"}`}>
              {task.text}
            </span>
            {!archived && (isOwner || task.createdBy === myId) && (
              <button type="button" onClick={() => remove(task)} aria-label={t("projects.removeTask", { text: task.text })} className="shrink-0 rounded px-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white">
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {!archived && (
        <form onSubmit={add} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_TASK}
            dir="auto"
            aria-label={t("projects.taskLabel")}
            placeholder={t("projects.taskPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 disabled:opacity-50">
            {t("projects.add")}
          </button>
        </form>
      )}
      {problem && (
        <p role="alert" className="text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}
