import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { projectsApi } from "../api/projects.api";
import { Avatar } from "../components/common/Avatar";
import { liveUpdates } from "../lib/liveUpdates";
import { shortAgo } from "../lib/when";
import type { Project } from "../types";
import { t } from "../i18n";

/** The project rooms you are in, the most recently active first, with what is new in each. */
export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      projectsApi
        .list()
        .then((r) => live && setProjects(r.projects))
        .catch((err) => {
          if (!live) return;
          setProjects((old) => old ?? []);
          setError(err instanceof ApiError ? err.message : t("projects.loadFailed"));
        });
    void load();
    const stop = liveUpdates.subscribe("project", () => void load());
    return () => {
      live = false;
      stop();
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t("projects.title")}</h1>
        <p className="text-sm text-white/70">{t("projects.intro")}</p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {projects === null && !error && <p className="text-sm text-white/60">{t("common.loading")}</p>}
      {projects?.length === 0 && !error && <p className="text-sm text-white/60">{t("projects.none")}</p>}
      <ul className="space-y-3">
        {projects?.map((p) => (
          <li key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 text-base font-medium text-white">
                <Link to={`/projects/${p.id}`} dir="auto" className="break-words hover:underline">
                  {p.title}
                </Link>
              </h2>
              {p.status === "archived" && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">{t("projects.archived")}</span>}
              {(p.unread ?? 0) > 0 && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white">{t("projects.unread", { n: p.unread ?? 0 })}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
              <span className="flex -space-x-2 rtl:space-x-reverse">
                {p.members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} username={m.username} displayName={m.displayName} avatarUrl={m.avatarUrl} size={22} className="border border-[#0e0e12]" />
                ))}
              </span>
              <span>{t("projects.people", { n: p.members.length })}</span>
              {(p.openTasks ?? 0) > 0 && <span>{t("projects.openTasks", { n: p.openTasks ?? 0 })}</span>}
              <span>{shortAgo(p.lastActivityAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
