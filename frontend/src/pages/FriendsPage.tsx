import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { friendsApi } from "../api/friends.api";
import { ApiError } from "../api/client";
import type { FriendRequest, User } from "../types";
import { Avatar } from "../components/common/Avatar";

export function FriendsPage() {
  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const [friendsRes, requestsRes] = await Promise.all([friendsApi.list(), friendsApi.requests()]);
      setFriends(friendsRes.friends);
      setRequests(requestsRes.requests);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load friends.");
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAccept(requestId: string) {
    setActionError(null);
    try {
      await friendsApi.accept(requestId);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't accept that request.");
    }
  }

  async function handleDecline(requestId: string) {
    setActionError(null);
    try {
      await friendsApi.decline(requestId);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't decline that request.");
    }
  }

  async function handleRemove(friendId: string) {
    setActionError(null);
    try {
      await friendsApi.remove(friendId);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't remove that friend.");
    }
  }

  if (status === "loading") return <div className="p-8 text-center text-white/40">Loading…</div>;
  if (status === "error") return <div className="p-8 text-center text-red-400">{error}</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}
      {requests.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Friend Requests</h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <Avatar username={r.requester.username} displayName={r.requester.displayName} avatarUrl={r.requester.avatarUrl} size={36} />
                <Link to={`/u/${r.requester.username}`} className="flex-1 font-medium text-white hover:underline">
                  {r.requester.displayName}
                </Link>
                <button onClick={() => handleAccept(r.id)} className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white">
                  Accept
                </button>
                <button onClick={() => handleDecline(r.id)} className="rounded-md border border-white/15 px-3 py-1 text-xs text-white/70">
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Friends ({friends.length})</h2>
        {friends.length === 0 && <p className="text-sm text-white/40">No friends yet — search for creatives to connect with.</p>}
        <div className="space-y-2">
          {friends.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <Avatar username={f.username} displayName={f.displayName} avatarUrl={f.avatarUrl} size={36} />
              <Link to={`/u/${f.username}`} className="flex-1 font-medium text-white hover:underline">
                {f.displayName}
              </Link>
              <button onClick={() => handleRemove(f.id)} className="text-xs text-white/40 hover:text-red-400">
                Unfriend
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
