import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { creditsApi } from "../../api/credits.api";
import { friendsApi } from "../../api/friends.api";
import { useAuth } from "../../context/AuthContext";
import { t } from "../../i18n";
import type { MediaCredit, MediaItem, User } from "../../types";

export const MAX_ROLE_LENGTH = 40;
export const MAX_CREDITS = 10;

/**
 * Who worked on a portfolio piece, under it. Everybody sees the accepted credits, linked to those people. The owner can credit a friend
 * (with what they did) and take any credit off; a person asked for one sees Accept and Decline; once accepted they can still leave it.
 */
export function PieceCredits({ item, isOwner, onChange }: { item: MediaItem; isOwner: boolean; onChange: (credits: MediaCredit[]) => void }) {
  const { user: viewer } = useAuth();
  const credits = item.credits ?? [];
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<User[] | null>(null);
  const [who, setWho] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // the friends to choose from are only looked up when the form is opened
  useEffect(() => {
    if (!adding || friends) return;
    let current = true;
    friendsApi
      .list()
      .then(({ friends: list }) => current && setFriends(list))
      .catch(() => current && setFriends([]));
    return () => {
      current = false;
    };
  }, [adding, friends]);

  if (!isOwner && credits.length === 0) return null;
  const creditable = (friends ?? []).filter((f) => !credits.some((c) => c.user.id === f.id));

  async function run(action: () => Promise<unknown>, apply: () => MediaCredit[]) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await action();
      onChange(apply());
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("credits.couldntDoThat"));
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!who || !role.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { credit } = await creditsApi.add(item.id, who, role.trim());
      onChange([...credits, credit]);
      setWho("");
      setRole("");
      setAdding(false);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("credits.couldntCredit"));
    } finally {
      setBusy(false);
    }
  }

  const small = "text-[11px] text-white/70 hover:text-white hover:underline disabled:opacity-50";
  return (
    <div className="space-y-1 bg-black/20 px-2 pb-1.5 text-[11px] text-white/80">
      {credits.length > 0 && (
        <ul aria-label={t("credits.withLabel")} className="space-y-0.5">
          {credits.map((c) => {
            const mine = viewer?.id === c.user.id;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-1.5">
                <Link to={`/u/${c.user.username}`} className="font-medium text-[var(--profile-accent-text)] hover:underline">
                  {c.user.displayName}
                </Link>
                <span dir="auto" className="text-white/70">
                  — {c.role}
                </span>
                {c.status === "pending" && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/70">{t("credits.waiting")}</span>}
                {mine && c.status === "pending" && (
                  <>
                    <button type="button" disabled={busy} onClick={() => run(() => creditsApi.accept(c.id), () => credits.map((x) => (x.id === c.id ? { ...x, status: "accepted" as const } : x)))} className="rounded bg-[var(--profile-accent-fill)] px-1.5 py-0.5 font-medium text-[var(--profile-on-accent)] disabled:opacity-50">
                      {t("friends.accept")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => run(() => creditsApi.remove(c.id), () => credits.filter((x) => x.id !== c.id))} className={small}>
                      {t("friends.decline")}
                    </button>
                  </>
                )}
                {(isOwner || (mine && c.status === "accepted")) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => creditsApi.remove(c.id), () => credits.filter((x) => x.id !== c.id))}
                    aria-label={isOwner ? t("credits.removeCredit", { name: c.user.displayName }) : t("credits.leaveCredit")}
                    title={isOwner ? t("credits.removeCredit", { name: c.user.displayName }) : t("credits.leaveCredit")}
                    className="text-white/60 hover:text-red-400 disabled:opacity-50"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isOwner && credits.length < MAX_CREDITS && (
        <>
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="text-[var(--profile-accent-text)] hover:underline">
              {t("credits.creditSomeone")}
            </button>
          ) : (
            <form onSubmit={add} className="flex flex-wrap items-center gap-1">
              <select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("credits.whoWorkedOnIt")} className="min-w-0 rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white focus:border-[var(--profile-accent)] focus:outline-none">
                <option value="">{friends ? (creditable.length ? t("credits.chooseAFriend") : t("credits.noFriendsToCredit")) : t("common.loading")}</option>
                {creditable.map((f) => (
                  <option key={f.id} value={f.username}>
                    {f.displayName}
                  </option>
                ))}
              </select>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                maxLength={MAX_ROLE_LENGTH}
                dir="auto"
                placeholder={t("credits.whatTheyDid")}
                aria-label={t("credits.whatTheyDid")}
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none"
              />
              <button type="submit" disabled={!who || !role.trim() || busy} className="rounded-md bg-[var(--profile-accent-fill)] px-2 py-1 font-medium text-[var(--profile-on-accent)] disabled:opacity-50">
                {busy ? t("credits.asking") : t("credits.ask")}
              </button>
              <button type="button" onClick={() => setAdding(false)} disabled={busy} className={small}>
                {t("common.cancel")}
              </button>
            </form>
          )}
        </>
      )}
      {problem && (
        <p role="alert" className="text-red-400">
          {problem}
        </p>
      )}
    </div>
  );
}
