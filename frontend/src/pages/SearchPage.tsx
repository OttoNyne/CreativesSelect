import { useState } from "react";
import { Link } from "react-router-dom";
import { profilesApi } from "../api/profiles.api";
import type { User } from "../types";
import { Avatar } from "../components/common/Avatar";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const { users } = await profilesApi.search(query.trim());
    setResults(users);
    setSearched(true);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creatives by name or username…"
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
        />
        <button type="submit" className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          Search
        </button>
      </form>

      <div className="space-y-2">
        {searched && results.length === 0 && <p className="text-sm text-white/40">No creatives found.</p>}
        {results.map((u) => (
          <Link
            key={u.id}
            to={`/u/${u.username}`}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06]"
          >
            <Avatar username={u.username} displayName={u.displayName} avatarUrl={u.avatarUrl} size={36} />
            <div>
              <div className="font-medium text-white">{u.displayName}</div>
              <div className="text-xs text-white/40">@{u.username}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
