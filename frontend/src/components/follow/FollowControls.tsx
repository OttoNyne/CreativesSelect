import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { followsApi, type FollowPerson } from "../../api/follows.api";
import { Avatar } from "../common/Avatar";
import { t } from "../../i18n";

/** "12 followers · 5 following": plain text for a visitor; for the owner, two buttons that open their lists. */
export function FollowCounts({ followers, following, onOpen }: { followers: number; following: number; onOpen?: (which: "followers" | "following") => void }) {
  const a = t("follow.followers", { n: followers });
  const b = t("follow.followingCount", { n: following });
  return (
    <p aria-label={t("follow.countsLabel")} className="mt-0.5 text-sm text-[var(--profile-muted)]">
      {onOpen ? (
        <>
          <button type="button" onClick={() => onOpen("followers")} className="hover:underline">
            {a}
          </button>
          {" · "}
          <button type="button" onClick={() => onOpen("following")} className="hover:underline">
            {b}
          </button>
        </>
      ) : (
        `${a} · ${b}`
      )}
    </p>
  );
}

/** Follow or stop following someone with a public profile. Says so when it can't be done. */
export function FollowButton({ username, displayName, following, onChange }: { username: string; displayName: string; following: boolean; onChange: (following: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (following) await followsApi.unfollow(username);
      else await followsApi.follow(username);
      onChange(!following);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("follow.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        aria-label={following ? t("follow.unfollowLabel", { name: displayName }) : t("follow.followLabel", { name: displayName })}
        className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${following ? "border border-white/20 bg-white/10" : "text-[var(--profile-on-accent)]"}`}
        style={following ? undefined : { background: "var(--profile-accent-fill)" }}
      >
        {following ? t("follow.following") : t("follow.follow")}
      </button>
      {problem && (
        <span role="alert" className="basis-full text-xs text-red-400">
          {problem}
        </span>
      )}
    </>
  );
}

/** The owner's own lists: who follows them, and who they follow (with a way to stop). */
export function FollowLists({ which, onClose, onUnfollowed }: { which: "followers" | "following"; onClose: () => void; onUnfollowed: () => void }) {
  const [people, setPeople] = useState<FollowPerson[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let current = true;
    setPeople(null);
    setProblem(null);
    (which === "followers" ? followsApi.followers() : followsApi.following())
      .then((r) => {
        if (!current) return;
        setPeople(r.people);
        setHasMore(r.hasMore);
        setPage(1);
      })
      .catch((err) => current && setProblem(err instanceof ApiError ? err.message : t("follow.failed")));
    return () => {
      current = false;
    };
  }, [which]);

  async function more() {
    setLoadingMore(true);
    try {
      const r = await (which === "followers" ? followsApi.followers(page + 1) : followsApi.following(page + 1));
      setPeople((old) => [...(old ?? []), ...r.people.filter((p) => !(old ?? []).some((o) => o.id === p.id))]);
      setPage(page + 1);
      setHasMore(r.hasMore);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("follow.failed"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function stop(person: FollowPerson) {
    setProblem(null);
    try {
      await followsApi.unfollow(person.username);
      setPeople((old) => (old ?? []).filter((p) => p.id !== person.id));
      onUnfollowed();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("follow.failed"));
    }
  }

  const title = which === "followers" ? t("follow.followersTitle") : t("follow.followingTitle");
  return (
    <section aria-label={title} className="profile-card mt-3 rounded-xl border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="text-xs text-[var(--profile-muted)] hover:underline">
          {t("follow.close")}
        </button>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {problem}
        </p>
      )}
      {people === null && !problem && <p className="mt-2 text-sm text-[var(--profile-muted)]">{t("follow.loading")}</p>}
      {people?.length === 0 && <p className="mt-2 text-sm text-[var(--profile-muted)]">{which === "followers" ? t("follow.noFollowers") : t("follow.noFollowing")}</p>}
      {people && people.length > 0 && (
        <ul className="mt-2 space-y-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar username={p.username} displayName={p.displayName} avatarUrl={p.avatarUrl} size={28} />
              <Link to={`/u/${p.username}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                <bdi>{p.displayName}</bdi> <bdi dir="ltr" className="text-[var(--profile-muted)]">@{p.username}</bdi>
              </Link>
              {which === "following" && (
                <button type="button" onClick={() => stop(p)} aria-label={t("follow.unfollowLabel", { name: p.displayName })} className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10">
                  {t("follow.unfollow")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" onClick={more} disabled={loadingMore} className="mt-2 text-xs text-[var(--profile-accent-text)] hover:underline disabled:opacity-50">
          {loadingMore ? t("follow.loading") : t("follow.more")}
        </button>
      )}
    </section>
  );
}
