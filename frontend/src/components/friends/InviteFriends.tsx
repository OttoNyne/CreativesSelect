import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { invitesApi } from "../../api/invites.api";
import { ApiError } from "../../api/client";
import { Avatar } from "../common/Avatar";
import { ShareButton } from "../share/ShareButton";
import { inviteUrl } from "../../lib/share";
import { formatDay } from "../../lib/when";
import type { Invite } from "../../types";

const MAX_ACTIVE = 3;
const button = "rounded-md border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50";

/** Make a link a friend can use to join and be your friend straight away: share it as a link or a QR code, see who came in, switch it off. */
export function InviteFriends() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invitesApi
      .list()
      .then(({ invites }) => {
        if (cancelled) return;
        setInvites(invites);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { invite } = await invitesApi.create();
      setInvites((old) => [invite, ...old]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make an invite link.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invite: Invite) {
    if (!window.confirm("Switch this link off? People who already joined through it stay your friends, but nobody new can use it.")) return;
    setError(null);
    try {
      await invitesApi.revoke(invite.id);
      setInvites((old) => old.filter((i) => i.id !== invite.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't switch that link off.");
    }
  }

  if (state === "loading") return null;

  return (
    <section aria-label="Invite friends" className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Invite friends</h2>
        {state === "ready" && invites.length < MAX_ACTIVE && (
          <button type="button" onClick={create} disabled={busy} className={button}>
            {busy ? "Making…" : "Create invite link"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-white/60">
        Anyone who signs up through your link becomes your friend straight away. A link works for 7 days and up to 10 people, and you can switch it off any time.
      </p>
      {state === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          Couldn&apos;t load your invite links.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {invites.map((invite) => {
          const url = inviteUrl(invite.code);
          return (
            <li key={invite.id} className="rounded-lg border border-white/10 p-3">
              <input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ShareButton url={url} title="Invite a friend" description="Anyone who signs up through this link becomes your friend." className={button}>
                  Share or show QR code
                </ShareButton>
                <button type="button" onClick={() => revoke(invite)} className="rounded-md border border-red-400/60 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10">
                  Switch off
                </button>
                <span className="text-xs text-white/60">
                  {invite.uses} of {invite.maxUses} used · expires {formatDay(invite.expiresAt)}
                </span>
              </div>
              {invite.joined.length > 0 && (
                <ul aria-label="Joined with this link" className="mt-2 space-y-1">
                  {invite.joined.map((j) => (
                    <li key={j.user.id} className="flex items-center gap-2 text-xs text-white/70">
                      <Avatar username={j.user.username} displayName={j.user.displayName} avatarUrl={j.user.avatarUrl} size={20} />
                      <Link to={`/u/${j.user.username}`} className="hover:underline">
                        {j.user.displayName}
                      </Link>
                      <span className="text-white/60">joined {formatDay(j.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
