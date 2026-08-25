import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { groupsApi } from "../api/groups.api";
import type { Group, GroupMember } from "../types";
import { Avatar } from "../components/common/Avatar";
import { useAuth } from "../context/AuthContext";

export function GroupDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ group }, { members }] = await Promise.all([groupsApi.get(id), groupsApi.members(id)]);
    setGroup(group);
    setMembers(members);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  const isMember = members.some((m) => m.user.username === user?.username);

  async function handleJoin() {
    await groupsApi.join(id);
    load();
  }

  async function handleLeave() {
    await groupsApi.leave(id);
    load();
  }

  if (loading || !group) return <div className="p-8 text-center text-white/40">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h1 className="text-xl font-bold text-white">{group.name}</h1>
        <p className="mt-1 text-sm text-white/60">{group.description}</p>
        <p className="mt-2 text-xs text-white/30">{group.memberCount} members</p>
        <button
          onClick={isMember ? handleLeave : handleJoin}
          className={`mt-3 rounded-md px-3 py-1.5 text-sm font-medium ${
            isMember ? "border border-white/15 text-white/70" : "bg-violet-600 text-white hover:bg-violet-500"
          }`}
        >
          {isMember ? "Leave group" : "Join group"}
        </button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Members</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.user.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <Avatar username={m.user.username} displayName={m.user.displayName} avatarUrl={m.user.avatarUrl} size={32} />
              <Link to={`/u/${m.user.username}`} className="flex-1 font-medium text-white hover:underline">
                {m.user.displayName}
              </Link>
              {m.role === "admin" && <span className="text-xs text-violet-400">Admin</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
