import { useCallback, useEffect, useState } from "react";
import { liveApi, type LiveInvitee } from "../../api/live.api";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import type { User } from "../../types";
import { t } from "../../i18n";

const POLL_MS = 15_000;
const small = "rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50";

/** The host of an invite-only live: who is invited (and who is in the room), a way to take an invitation back, and friends to invite. */
export function InvitePanel({ liveId }: { liveId: string }) {
  const [invited, setInvited] = useState<LiveInvitee[] | null>(null);
  const [max, setMax] = useState(100);
  const [friends, setFriends] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await liveApi.invites(liveId);
      setInvited(r.invited);
      setMax(r.max);
    } catch {
      // a failed refresh just tries again next time
    }
  }, [liveId]);

  useEffect(() => {
    // who is invited and who is in the room, kept fresh while the host looks at it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => !document.hidden && void load(), POLL_MS);
    friendsApi
      .list()
      .then(({ friends: found }) => setFriends(found))
      .catch(() => {});
    return () => clearInterval(timer);
  }, [load]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await run();
      await load();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("live.thatDidntWorkPlease"));
    } finally {
      setBusy(false);
    }
  }

  const invitedIds = new Set((invited ?? []).map((i) => i.user.id));
  const others = friends.filter((f) => !invitedIds.has(f.id));
  const full = (invited?.length ?? 0) >= max;

  return (
    <section aria-label={t("privatelive.panelTitle")} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold text-white">{t("privatelive.panelTitle")}</h2>
      {invited === null ? (
        <p className="text-sm text-white/60">{t("common.loading")}</p>
      ) : invited.length === 0 ? (
        <p className="text-sm text-white/60">{t("privatelive.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {invited.map(({ user, present }) => (
            <li key={user.id} className="flex items-center gap-2">
              <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{user.displayName}</span>
              {present && <span className="rounded bg-emerald-600/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">{t("privatelive.inRoom")}</span>}
              <button type="button" disabled={busy} onClick={() => void act(() => liveApi.uninvite(liveId, user.id))} aria-label={t("privatelive.removeAria", { name: user.displayName })} className={small}>
                {t("privatelive.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {invited !== null && (
        <div className="space-y-1 border-t border-white/10 pt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-white/60">{t("privatelive.addTitle")}</h3>
          {full ? (
            <p className="text-xs text-white/60">{t("privatelive.max", { max })}</p>
          ) : others.length === 0 ? (
            <p className="text-xs text-white/60">{t("privatelive.allInvited")}</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {others.map((friend) => (
                <li key={friend.id} className="flex items-center gap-2">
                  <Avatar username={friend.username} displayName={friend.displayName} avatarUrl={friend.avatarUrl} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{friend.displayName}</span>
                  <button type="button" disabled={busy} onClick={() => void act(() => liveApi.invite(liveId, [friend.id]))} aria-label={t("privatelive.inviteAria", { name: friend.displayName })} className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                    {t("privatelive.invite")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}
