import { useState } from "react";
import { aiApi } from "../../api/ai.api";
import type { ImageSearchResult } from "../../types";

export function ImageSearchPicker({
  onSelect,
  label = "🔍 Search photos",
}: {
  onSelect: (url: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { results } = await aiApi.searchImages(query.trim());
      setResults(results);
      setSearched(true);
    } catch {
      setError("Couldn't search right now, try again.");
    } finally {
      setLoading(false);
    }
  }

  function handlePick(url: string) {
    onSelect(url);
    setOpen(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
      >
        {label}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe the image you want…"
              className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-sky-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          {searched && !loading && results.length === 0 && !error && (
            <p className="mt-2 text-xs text-white/40">No photos found for that.</p>
          )}

          {results.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handlePick(r.url)}
                  title={r.creator ? `${r.title} — ${r.creator}` : r.title}
                  className="group relative aspect-square overflow-hidden rounded-md border border-white/10 hover:border-sky-400"
                >
                  <img src={r.thumbnailUrl} alt={r.title} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-white/30">Openly-licensed photos via Openverse.</p>
        </div>
      )}
    </div>
  );
}
