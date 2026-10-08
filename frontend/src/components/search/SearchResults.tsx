import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { searchApi } from "../../api/search.api";
import type { BlogResult, GroupResult, HelpResult, PersonResult, SearchConnection, SearchType, TopicResult } from "../../api/search.api";
import type { User } from "../../types";
import { Highlight } from "../common/Highlight";
import { PersonCard } from "./PersonCard";
import { formatDay } from "../../lib/when";
import { t, type Key } from "../../i18n";
import { tRich } from "../../i18n/rich";

type Result = PersonResult | BlogResult | GroupResult | TopicResult | HelpResult;

const nothingFound = (type: SearchType): string => t(({ people: "misc.noCreatives", blog: "misc.noBlog", groups: "misc.noGroups", topics: "misc.noTopics", help: "misc.noRequests" } as const)[type]);

const PRIORITY_WORDS: Record<string, Key> = { low: "misc.priority.low", medium: "misc.priority.medium", high: "misc.priority.high" };

const idOf = (r: Result) => (r as { id: string }).id;

function By({ author }: { author: User | null }) {
  if (!author) return null;
  return (
    <>
      {t("misc.byAuthor")}{" "}
      <Link to={`/u/${author.username}`} className="hover:underline">
        {author.displayName}
      </Link>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <li className="rounded-lg border border-white/10 bg-white/[0.03] p-3">{children}</li>;
}

/** What a search found, of one kind, with the words marked and a way to see more. */
export function SearchResults({ q, type, tag, connection, onTag }: { q: string; type: SearchType; tag: string; connection: SearchConnection; onTag: (tag: string) => void }) {
  const [items, setItems] = useState<Result[] | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // starts over whenever the question, the kind or a filter changes
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    searchApi
      .search<Result>({ q, type, tag, connection })
      .then((res) => {
        if (cancelled) return;
        setItems(res.results);
        setWords(res.words);
        setPage(1);
        setHasMore(res.hasMore);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof ApiError ? err.message : t("misc.couldntSearchRightNow"));
      });
    return () => {
      cancelled = true;
    };
  }, [q, type, tag, connection]);

  async function showMore() {
    setLoadingMore(true);
    try {
      const res = await searchApi.search<Result>({ q, type, tag, connection, page: page + 1 });
      setItems((old) => [...(old ?? []), ...res.results.filter((r) => !(old ?? []).some((o) => idOf(o) === idOf(r)))]);
      setPage(page + 1);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("events.couldntLoadMore"));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-2">
      {items === null && <p className="text-sm text-white/60">{t("profile.searching")}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {items?.length === 0 && !error && <p className="text-sm text-white/60">{nothingFound(type)}</p>}
      <ul className="space-y-2">
        {items?.map((r) => {
          if (type === "people") {
            const p = r as PersonResult;
            return <PersonCard key={p.id} user={p} words={words} mutualCount={p.mutualCount} isFriend={p.isFriend} onTag={onTag} />;
          }
          if (type === "blog") {
            const b = r as BlogResult;
            return (
              <Card key={b.id}>
                <Link to={`/blog/${b.id}`} className="font-medium text-white hover:underline">
                  <Highlight text={b.title} words={words} />
                </Link>
                <p className="mt-0.5 text-xs text-white/60">
                  <By author={b.author} /> · {formatDay(b.createdAt)}
                  {b.commentCount > 0 && ` · ${b.commentCount} ${b.commentCount === 1 ? "comment" : "comments"}`}
                </p>
                {b.snippet && (
                  <p className="mt-1 text-sm text-white/70">
                    <Highlight text={b.snippet} words={words} />
                  </p>
                )}
              </Card>
            );
          }
          if (type === "groups") {
            const g = r as GroupResult;
            return (
              <Card key={g.id}>
                <Link to={`/groups/${g.id}`} className="font-medium text-white hover:underline">
                  <Highlight text={g.name} words={words} />
                </Link>
                <p className="mt-0.5 text-xs text-white/60">
                  {t("misc.memberCount", { n: g.memberCount })}
                  {g.isMember && ` · ${t("misc.youAreInGroup")}`}
                </p>
                {(g.snippet || g.description) && (
                  <p className="mt-1 line-clamp-2 text-sm text-white/70">
                    <Highlight text={g.snippet || g.description || ""} words={words} />
                  </p>
                )}
              </Card>
            );
          }
          if (type === "topics") {
            const topic = r as TopicResult;
            return (
              <Card key={topic.id}>
                <Link to={`/groups/${topic.groupId}`} className="font-medium text-white hover:underline">
                  <Highlight text={topic.title} words={words} />
                </Link>
                <p className="mt-0.5 text-xs text-white/60">
                  {tRich("misc.topicMeta", { author: <By author={topic.author} /> }, { group: topic.groupName, replies: t("groups.replyCount", { n: topic.replyCount }) })}
                </p>
                {topic.snippet && (
                  <p className="mt-1 text-sm text-white/70">
                    <Highlight text={topic.snippet} words={words} />
                  </p>
                )}
              </Card>
            );
          }
          const h = r as HelpResult;
          return (
            <Card key={h.id}>
              <Link to="/help-wanted" className="font-medium text-white hover:underline">
                <Highlight text={h.title} words={words} />
              </Link>
              <p className="mt-0.5 text-xs text-white/60">
                <By author={h.author} /> · {t("misc.priorityDue", { priority: PRIORITY_WORDS[h.priority] ? t(PRIORITY_WORDS[h.priority]) : h.priority })}{h.dueDate ? ` · ${t("misc.due", { day: formatDay(h.dueDate) })}` : ""}
              </p>
              {h.snippet && (
                <p className="mt-1 text-sm text-white/70">
                  <Highlight text={h.snippet} words={words} />
                </p>
              )}
            </Card>
          );
        })}
      </ul>
      {hasMore && (
        <button type="button" onClick={showMore} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? t("common.loading") : t("events.showMore")}
        </button>
      )}
    </div>
  );
}
