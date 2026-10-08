import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { groupsApi } from "../api/groups.api";
import { ApiError } from "../api/client";
import type { Group, GroupMember } from "../types";
import { Avatar } from "../components/common/Avatar";
import { GroupChat } from "../components/group/GroupChat";
import { GroupBoard } from "../components/group/GroupBoard";
import { t } from "../i18n";

export function GroupDetailPage() {
  const { id = "" } = useParams();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersPage, setMembersPage] = useState(1);
  const [moreMembers, setMoreMembers] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const [{ group }, members] = await Promise.all([groupsApi.get(id), groupsApi.members(id)]);
      setGroup(group);
      setMembers(members.members);
      setMembersPage(1);
      setMoreMembers(Boolean(members.hasMore));
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("groups.failedToLoadThis"));
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Whether you have joined, and your role, come from the group itself: the member list is paged, so you may not be on the page shown.
  const isMember = Boolean(group?.isMember);
  const isAdmin = group?.myRole === "admin";

  async function showMoreMembers() {
    setLoadingMembers(true);
    try {
      const next = await groupsApi.members(id, membersPage + 1);
      setMembers((old) => [...old, ...next.members.filter((m) => !old.some((o) => o.user.id === m.user.id))]);
      setMembersPage(membersPage + 1);
      setMoreMembers(Boolean(next.hasMore));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("groups.couldntLoadMoreMembers"));
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleJoin() {
    setActionError(null);
    try {
      await groupsApi.join(id);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("groups.couldntJoinThatGroup"));
    }
  }

  async function handleLeave() {
    setActionError(null);
    try {
      await groupsApi.leave(id);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("groups.couldntLeaveThatGroup"));
    }
  }

  if (status === "loading") return <div className="p-8 text-center text-white/60">{t("common.loading")}</div>;
  if (status === "error" || !group) return <div className="p-8 text-center text-red-400">{error}</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h1 className="text-xl font-bold text-white">{group.name}</h1>
        <p className="mt-1 text-sm text-white/60">{group.description}</p>
        <p className="mt-2 text-xs text-white/60">{t("groups.memberCount", { n: group.memberCount })}</p>
        <button
          onClick={isMember ? handleLeave : handleJoin}
          className={`mt-3 rounded-md px-3 py-1.5 text-sm font-medium ${
            isMember ? "border border-white/15 text-white/70" : "bg-violet-600 text-white hover:bg-violet-500"
          }`}
        >
          {isMember ? t("groups.leaveGroup") : t("groups.joinGroup")}
        </button>
      </div>

      {isMember && <GroupBoard groupId={id} canModerate={isAdmin} />}

      {isMember && <GroupChat groupId={id} canModerate={isAdmin} />}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">{t("groups.members")}</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.user.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <Avatar username={m.user.username} displayName={m.user.displayName} avatarUrl={m.user.avatarUrl} size={32} />
              <Link to={`/u/${m.user.username}`} className="flex-1 font-medium text-white hover:underline">
                {m.user.displayName}
              </Link>
              {m.role === "admin" && <span className="text-xs text-violet-400">{t("groups.admin")}</span>}
            </div>
          ))}
        </div>
        {moreMembers && (
          <button type="button" onClick={showMoreMembers} disabled={loadingMembers} className="mt-2 w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
            {loadingMembers ? t("common.loading") : t("groups.showMoreMembers")}
          </button>
        )}
      </div>
    </div>
  );
}
