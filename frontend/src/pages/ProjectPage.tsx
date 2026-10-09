import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { projectsApi } from "../api/projects.api";
import { Avatar } from "../components/common/Avatar";
import { CSBadge } from "../components/common/CSBadge";
import { ProjectChat } from "../components/projects/ProjectChat";
import { ProjectChecklist } from "../components/projects/ProjectChecklist";
import { useAuth } from "../context/AuthContext";
import { liveUpdates } from "../lib/liveUpdates";
import type { Project, ProjectTask } from "../types";
import { t } from "../i18n";

const small = "rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10 disabled:opacity-50";

/** One project room: who is in it, its checklist and its chat, and ways to look after it (rename, archive, remove people, delete, leave). */
export function ProjectPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      setProject((await projectsApi.get(id)).project);
    } catch (err) {
      setProject(null);
      setError(err instanceof ApiError && err.status !== 404 ? err.message : t("projects.notFound"));
    }
  }, [id]);

  useEffect(() => {
    setError(null);
    void load();
    const stop = liveUpdates.subscribe("project", (data) => {
      if (data.id === id) void load();
    });
    return stop;
  }, [id, load]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("projects.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
        <Link to="/projects" className="text-sm text-violet-300 hover:underline">
          {t("projects.back")}
        </Link>
      </div>
    );
  }
  if (!project || !user) return <p className="px-4 py-6 text-center text-sm text-white/60">{t("common.loading")}</p>;
  const archived = project.status === "archived";

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link to="/projects" className="text-sm text-violet-300 hover:underline">
        {t("projects.back")}
      </Link>

      <header className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { project: saved } = await projectsApi.update(project.id, { title: name.trim() });
                setProject({ ...project, title: saved.title });
                setRenaming(false);
              });
            }}
            className="flex flex-wrap gap-2"
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} dir="auto" aria-label={t("projects.nameLabel")} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none" />
            <button type="submit" disabled={busy || !name.trim()} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {t("projects.save")}
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="text-sm text-white/70 hover:underline">
              {t("projects.cancel")}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <h1 dir="auto" className="min-w-0 flex-1 break-words text-xl font-semibold text-white">
              {project.title}
            </h1>
            {archived && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">{t("projects.archived")}</span>}
            {project.callId && project.isOwner && (
              <Link to={`/calls/${project.callId}`} className="text-xs text-violet-300 hover:underline">
                {t("calls.title")}
              </Link>
            )}
          </div>
        )}
        {archived && <p className="text-xs text-white/70">{t("projects.archivedNote")}</p>}

        <section aria-label={t("projects.peopleHeading")}>
          <h2 className="sr-only">{t("projects.peopleHeading")}</h2>
          <ul className="flex flex-wrap gap-2">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center gap-1.5 rounded-full border border-white/15 py-0.5 ps-0.5 pe-2.5 text-xs text-white">
                <Link to={`/u/${m.username}`} className="flex items-center gap-1.5 hover:underline">
                  <Avatar username={m.username} displayName={m.displayName} avatarUrl={m.avatarUrl} size={22} />
                  <span>{m.displayName}</span>
                  <CSBadge verified={m.csVerified} size={11} />
                </Link>
                {m.isOwner && <span className="text-white/60">· {t("projects.owner")}</span>}
                {project.isOwner && !m.isOwner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => window.confirm(t("projects.confirmRemove")) && void run(async () => { await projectsApi.removeMember(project.id, m.id); await load(); })}
                    aria-label={t("projects.removePerson", { name: m.displayName })}
                    className="rounded-full px-1 text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap gap-2">
          {project.isOwner ? (
            <>
              <button type="button" disabled={busy || renaming} onClick={() => { setName(project.title); setRenaming(true); }} className={small}>
                {t("projects.rename")}
              </button>
              <button type="button" disabled={busy} onClick={() => run(async () => { const { project: saved } = await projectsApi.update(project.id, { status: archived ? "active" : "archived" }); setProject({ ...project, status: saved.status }); })} className={small}>
                {archived ? t("projects.unarchive") : t("projects.archive")}
              </button>
              <button type="button" disabled={busy} onClick={() => window.confirm(t("projects.confirmDelete")) && void run(async () => { await projectsApi.remove(project.id); navigate("/projects"); })} className={`${small} hover:text-red-400`}>
                {t("projects.delete")}
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => window.confirm(t("projects.confirmLeave")) && void run(async () => { await projectsApi.leave(project.id); navigate("/projects"); })} className={small}>
              {t("projects.leave")}
            </button>
          )}
        </div>
        {problem && (
          <p role="alert" className="text-xs text-red-400">
            {problem}
          </p>
        )}
      </header>

      <ProjectChecklist projectId={project.id} tasks={project.tasks ?? []} onChange={(tasks: ProjectTask[]) => setProject({ ...project, tasks })} archived={archived} isOwner={project.isOwner} myId={user.id} />
      <ProjectChat projectId={project.id} archived={archived} isOwner={project.isOwner} />
    </div>
  );
}
