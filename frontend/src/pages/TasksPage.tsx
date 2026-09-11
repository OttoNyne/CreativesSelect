import { useEffect, useState } from "react";
import { tasksApi } from "../api/tasks.api";
import { ApiError } from "../api/client";
import type { Task } from "../types";

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setStatus("loading");
    try {
      const data = await tasksApi.list();
      setTasks(data);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load tasks.");
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;

    setCreating(true);
    try {
      await tasksApi.create({ title: newTitle.trim() });
      setNewTitle("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create task.");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") {
    return <div className="p-8 text-center text-white/40">Loading tasks…</div>;
  }

  if (status === "error") {
    return <div className="p-8 text-center text-red-400">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
        Tasks ({tasks.length})
      </h2>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          placeholder="New task title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {creating ? "Adding…" : "Add"}
        </button>
      </form>

      {tasks.length === 0 && <p className="text-sm text-white/40">No tasks yet.</p>}

      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task._id}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
          >
            <span className={task.done ? "flex-1 text-white/40 line-through" : "flex-1 text-white"}>
              {task.title}
            </span>
            <span className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60">
              {task.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
