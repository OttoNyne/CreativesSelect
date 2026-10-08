import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tasksApi } from "../api/tasks.api";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import type { BoardTask, Task } from "../types";
import { t } from "../i18n";
import { Linkified } from "../components/common/Linkified";
import { MentionTextarea } from "../components/common/MentionField";
import { shortAgo } from "../lib/when";


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
  const [offering, setOffering] = useState<string | null>(null);
  const [offerMessage, setOfferMessage] = useState("");

  async function load() {
    try {
      const [myTasks, { tasks }] = await Promise.all([tasksApi.list(), tasksApi.board()]);
      setMine(myTasks);
      setBoard(tasks);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("misc.failedToLoadHelp"));
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
    }, t("misc.failedToPostYour"));
    setCreating(false);
  }

  async function handleOffer(id: string) {
    setActionError(null);
    try {
      await tasksApi.offerHelp(id, offerMessage.trim() || undefined);
      setOffered((s) => new Set(s).add(id));
      setOffering(null);
      setOfferMessage("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("misc.couldntSendYourOffer"));
    }
  }

  if (status === "loading") {
    return <div className="p-8 text-center text-white/60">{t("misc.loadingHelpWanted")}</div>;
  }

  if (status === "error") {
    return <div className="p-8 text-center text-red-400">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          {t("misc.helpWantedHeading", { n: board.length })}
        </h2>
        <p className="text-xs text-white/60">
          {t("misc.openRequestsFromOther")}
        </p>
        {board.length === 0 && (
          <p className="text-sm text-white/60">{t("misc.noOpenRequestsFrom")}</p>
        )}
        {board.map((item) => (
          <div key={item._id} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2">
              <Link to={`/u/${item.author.username}`} className="shrink-0">
                <Avatar
                  username={item.author.username}
                  displayName={item.author.displayName}
                  avatarUrl={item.author.avatarUrl}
                  size={28}
                />
              </Link>
              <Link to={`/u/${item.author.username}`} className="min-w-0 truncate text-sm font-medium text-white hover:underline">
                {item.author.displayName}
              </Link>
              <span className="text-xs text-white/60">{shortAgo(item.createdAt)}</span>
            </div>
            <div className="font-medium text-white">{item.title}</div>
            {item.description && <p dir="auto" className="whitespace-pre-wrap text-sm text-white/70"><Linkified text={item.description} /></p>}
            {offered.has(item._id) ? (
              <button
                type="button"
                disabled
                className="rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-white/60"
              >
                {t("misc.offerSent")}
              </button>
            ) : offering === item._id ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder={t("misc.addANoteOptional")}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleOffer(item._id)}
                    className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500"
                  >
                    {t("misc.sendOffer")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOffering(null);
                      setOfferMessage("");
                    }}
                    className="rounded-md border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOffering(item._id)}
                className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500"
              >
                {t("misc.offerHelp")}
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          {t("misc.myRequestsHeading", { n: mine.length })}
        </h2>

        <form onSubmit={handleCreate} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t("misc.whatDoYouNeed")}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {creating ? t("composer.posting") : t("composer.post")}
            </button>
          </div>
          <MentionTextarea
            placeholder={t("events.detailsOptional")}
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            maxLength={1000}
            rows={2}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-white/60">
            <input type="checkbox" checked={onlyMe} onChange={(e) => setOnlyMe(e.target.checked)} />
            {t("misc.onlyMeKeepThis")}
          </label>
        </form>

        {mine.length === 0 && (
          <p className="text-sm text-white/60">{t("misc.nothingHereYetPost")}</p>
        )}

        {mine.map((task) => (
          <div key={task._id} className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-3">
              <span className={task.done ? "min-w-0 flex-1 text-white/60 line-through" : "min-w-0 flex-1 text-white"}>
                {task.title}
              </span>
              <span className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60">
                {task.isPublic ? t("events.public") : t("misc.onlyMe")}
              </span>
            </div>
            {task.description && <p dir="auto" className="whitespace-pre-wrap text-sm text-white/60"><Linkified text={task.description} /></p>}
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                onClick={() => run(() => tasksApi.update(task._id, { done: !task.done }), t("misc.couldntUpdateThatRequest"))}
                className="text-violet-400 hover:underline"
              >
                {task.done ? t("misc.reopen") : t("misc.markResolved")}
              </button>
              <button
                type="button"
                onClick={() => run(() => tasksApi.update(task._id, { isPublic: !task.isPublic }), t("misc.couldntUpdateThatRequest"))}
                className="text-white/60 hover:text-white"
              >
                {task.isPublic ? t("misc.makePrivate") : t("misc.makePublic")}
              </button>
              <button
                type="button"
                onClick={() => run(() => tasksApi.remove(task._id), t("misc.couldntDeleteThatRequest"))}
                className="ms-auto text-white/60 hover:text-red-400"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
