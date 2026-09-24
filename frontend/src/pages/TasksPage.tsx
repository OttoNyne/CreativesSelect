import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tasksApi } from "../api/tasks.api";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import type { BoardTask, Task } from "../types";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TasksPage() {
  const [mine, setMine] = useState<Task[]>([]);
  const [board, setBoard] = useState<BoardTask[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [onlyMe, setOnlyMe] = useState(false);
  const [creating, setCreating] = useState(false);
  const [offered, setOffered] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const [myTasks, { tasks }] = await Promise.all([tasksApi.list(), tasksApi.board()]);
      setMine(myTasks);
      setBoard(tasks);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load help wanted posts.");
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    await run(async () => {
      await tasksApi.create({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        isPublic: !onlyMe,
      });
      setNewTitle("");
      setNewDescription("");
    }, "Failed to post your request.");
    setCreating(false);
  }

  async function handleOffer(id: string) {
    setActionError(null);
    try {
      await tasksApi.offerHelp(id);
      setOffered((s) => new Set(s).add(id));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't send your offer.");
    }
  }

  if (status === "loading") {
    return <div className="p-8 text-center text-white/40">Loading help wanted…</div>;
  }

  if (status === "error") {
    return <div className="p-8 text-center text-red-400">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Help wanted ({board.length})
        </h2>
        <p className="text-xs text-white/40">
          Open requests from other creatives. Offer to help and they'll get a notification.
        </p>
        {board.length === 0 && (
          <p className="text-sm text-white/40">No open requests from others right now.</p>
        )}
        {board.map((t) => (
          <div key={t._id} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2">
              <Link to={`/u/${t.author.username}`} className="shrink-0">
                <Avatar
                  username={t.author.username}
                  displayName={t.author.displayName}
                  avatarUrl={t.author.avatarUrl}
                  size={28}
                />
              </Link>
              <Link to={`/u/${t.author.username}`} className="min-w-0 truncate text-sm font-medium text-white hover:underline">
                {t.author.displayName}
              </Link>
              <span className="text-xs text-white/30">{timeAgo(t.createdAt)}</span>
            </div>
            <div className="font-medium text-white">{t.title}</div>
            {t.description && <p className="whitespace-pre-wrap text-sm text-white/70">{t.description}</p>}
            <button
              type="button"
              onClick={() => handleOffer(t._id)}
              disabled={offered.has(t._id)}
              className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:bg-white/10 disabled:text-white/50"
            >
              {offered.has(t._id) ? "Offer sent ✓" : "Offer help"}
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          My requests ({mine.length})
        </h2>

        <form onSubmit={handleCreate} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="What do you need help with?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {creating ? "Posting…" : "Post"}
            </button>
          </div>
          <textarea
            placeholder="Details (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            maxLength={1000}
            rows={2}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-white/50">
            <input type="checkbox" checked={onlyMe} onChange={(e) => setOnlyMe(e.target.checked)} />
            Only me — keep this off the public board
          </label>
        </form>

        {mine.length === 0 && (
          <p className="text-sm text-white/40">Nothing here yet — post something you need help with.</p>
        )}

        {mine.map((task) => (
          <div key={task._id} className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-3">
              <span className={task.done ? "min-w-0 flex-1 text-white/40 line-through" : "min-w-0 flex-1 text-white"}>
                {task.title}
              </span>
              <span className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60">
                {task.isPublic ? "Public" : "Only me"}
              </span>
            </div>
            {task.description && <p className="whitespace-pre-wrap text-sm text-white/60">{task.description}</p>}
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                onClick={() => run(() => tasksApi.update(task._id, { done: !task.done }), "Couldn't update that request.")}
                className="text-violet-400 hover:underline"
              >
                {task.done ? "Reopen" : "Mark resolved"}
              </button>
              <button
                type="button"
                onClick={() => run(() => tasksApi.update(task._id, { isPublic: !task.isPublic }), "Couldn't update that request.")}
                className="text-white/50 hover:text-white"
              >
                {task.isPublic ? "Make private" : "Make public"}
              </button>
              <button
                type="button"
                onClick={() => run(() => tasksApi.remove(task._id), "Couldn't delete that request.")}
                className="ml-auto text-white/40 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
