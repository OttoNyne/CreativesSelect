import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { groupsApi } from "../api/groups.api";
import type { Group } from "../types";

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(search?: string) {
    const { groups } = await groupsApi.list(search);
    setGroups(groups);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(search);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await groupsApi.create({ name: name.trim(), description: description.trim() || undefined });
    setName("");
    setDescription("");
    setShowCreate(false);
    load();
  }

  async function handleJoin(id: string) {
    await groupsApi.join(id);
    load(search);
  }

  async function handleLeave(id: string) {
    await groupsApi.leave(id);
    load(search);
  }

  if (loading) return <div className="p-8 text-center text-white/40">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70">
            Search
          </button>
        </form>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          + New group
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this group about?"
            rows={2}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white">
            Create
          </button>
        </form>
      )}

      <div className="space-y-2">
        {groups.length === 0 && <p className="text-sm text-white/40">No groups found.</p>}
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex-1">
              <Link to={`/groups/${g.id}`} className="font-medium text-white hover:underline">
                {g.name}
              </Link>
              <p className="text-xs text-white/50">{g.description}</p>
              <p className="text-xs text-white/30">{g.memberCount} members</p>
            </div>
            {g.isMember ? (
              <button
                onClick={() => handleLeave(g.id)}
                className="rounded-md border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
              >
                Leave
              </button>
            ) : (
              <button
                onClick={() => handleJoin(g.id)}
                className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500"
              >
                Join
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
