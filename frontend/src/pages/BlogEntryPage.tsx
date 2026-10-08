import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { blogApi } from "../api/blog.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import { CSBadge } from "../components/common/CSBadge";
import { BlogComments } from "../components/blog/BlogComments";
import { formatDay } from "../lib/when";
import type { BlogEntry } from "../types";
import { t } from "../i18n";
import { Linkified } from "../components/common/Linkified";

// One blog entry on its own page: where a notification about a new entry lands. The author can change or delete it;
// anyone else can report it.
export function BlogEntryPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const highlightId = params.get("comment");
  const [entry, setEntry] = useState<BlogEntry | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setEntry(null);
    blogApi
      .get(id)
      .then(({ entry }) => {
        if (cancelled) return;
        setEntry(entry);
        setCommentCount(entry.commentCount ?? 0);
        setState("ready");
      })
      .catch((err) => {
        if (!cancelled) setState(err instanceof ApiError && err.status === 404 ? "missing" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDelete() {
    if (!entry || !window.confirm(t("misc.deleteEntryConfirm", { title: entry.title }))) return;
    try {
      await blogApi.remove(entry.id);
      navigate(`/u/${entry.author.username}#blog`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("misc.couldntDeleteThatEntry"));
    }
  }

  async function handleReport() {
    if (!entry) return;
    const reason = prompt(t("misc.whatsTheIssueWith2"));
    if (!reason) return;
    try {
      await moderationApi.report("blogEntry", entry.id, reason);
      alert(t("profile.reportSubmittedThanksFor"));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("profile.couldntSubmitThatReport"));
    }
  }

  const edited = entry && new Date(entry.updatedAt).getTime() - new Date(entry.createdAt).getTime() > 60_000;

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
      {entry ? (
        <Link to={`/u/${entry.author.username}#blog`} className="text-sm text-violet-400 hover:underline">
          {t("misc.backToProfile", { name: entry.author.displayName })}
        </Link>
      ) : (
        <Link to="/" className="text-sm text-violet-400 hover:underline">
          {t("misc.backToYourFeed")}
        </Link>
      )}
      {state === "loading" && <p className="p-8 text-center text-white/60">{t("common.loading")}</p>}
      {state === "missing" && (
        <p role="alert" className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/70">
          {t("misc.thisEntryIsntAvailable")}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-red-400">
          {t("misc.couldntLoadThisEntry")}
        </p>
      )}
      {state === "ready" && entry && (
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h1 className="text-2xl font-semibold text-white">{entry.title}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-white/70">
            <Avatar username={entry.author.username} displayName={entry.author.displayName} avatarUrl={entry.author.avatarUrl} size={28} />
            <Link to={`/u/${entry.author.username}`} className="hover:underline">
              {entry.author.displayName}
              <CSBadge verified={entry.author.csVerified} size={14} className="ms-1" />
            </Link>
            <span aria-hidden="true">·</span>
            <time dateTime={entry.createdAt}>{formatDay(entry.createdAt)}</time>
            {edited && <span className="text-white/60">{t("edit.mark")}</span>}
          </div>
          <div className="mt-5 space-y-4 text-white/90">
            {entry.body.split("\n\n").map((paragraph, i) => (
              <p key={i} dir="auto" className="whitespace-pre-line break-words leading-relaxed">
                <Linkified text={paragraph} />
              </p>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {entry.isAuthor ? (
              <>
                <Link to={`/blog/${entry.id}/edit`} className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10">
                  {t("misc.editEntry")}
                </Link>
                <button type="button" onClick={handleDelete} className="rounded-md border border-red-400/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10">
                  {t("misc.deleteEntry")}
                </button>
              </>
            ) : (
              <button type="button" onClick={handleReport} className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10">
                {t("common.report")}
              </button>
            )}
          </div>
        </article>
      )}
      {state === "ready" && entry && (
        <section aria-label={t("misc.comments")} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            {t("misc.comments")} <span className="font-normal normal-case">({commentCount})</span>
          </h2>
          <BlogComments entryId={entry.id} isAuthor={entry.isAuthor} onCountChange={(update) => setCommentCount(update)} highlightId={highlightId} />
        </section>
      )}
    </div>
  );
}
