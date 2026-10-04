import { useState } from "react";
import { MAX_ALBUM_TITLE, MAX_ALBUMS } from "../../api/albums.api";
import type { Album } from "../../types";

export const ALL = "all";

interface Props {
  albums: Album[];
  /** How many pieces are in each album, and in the whole portfolio. */
  counts: Record<string, number>;
  total: number;
  /** The chosen album's id, or ALL. */
  selected: string;
  onSelect: (id: string) => void;
  isOwner: boolean;
  /** Each returns a message if it couldn't be done, or null when it was. */
  onCreate: (title: string) => Promise<string | null>;
  onRename: (id: string, title: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<void>;
}

const chip = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs ${active ? "border-[var(--profile-accent)] bg-white/15 text-white" : "border-white/20 text-white/80 hover:bg-white/10"}`;
const field =
  "min-w-0 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/55 focus:border-[var(--profile-accent)] focus:outline-none";

/** The row of albums above a portfolio: pick one to see just its pieces. Its owner can also make, rename and delete albums. */
export function AlbumBar({ albums, counts, total, selected, onSelect, isOwner, onCreate, onRename, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const current = albums.find((a) => a.id === selected);

  if (!albums.length && !isOwner) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setMessage(null);
    const problem = renaming && current ? await onRename(current.id, draft) : await onCreate(draft);
    if (problem) return setMessage(problem);
    setDraft("");
    setAdding(false);
    setRenaming(false);
  }

  function close() {
    setAdding(false);
    setRenaming(false);
    setDraft("");
    setMessage(null);
  }

  return (
    <div className="mt-3">
      <ul aria-label="Albums" className="flex flex-wrap items-center gap-1.5">
        <li>
          <button type="button" onClick={() => onSelect(ALL)} aria-pressed={selected === ALL} className={chip(selected === ALL)}>
            All pieces ({total})
          </button>
        </li>
        {albums.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onSelect(a.id)} aria-pressed={selected === a.id} className={chip(selected === a.id)}>
              {a.title} ({counts[a.id] ?? 0})
            </button>
          </li>
        ))}
        {isOwner && albums.length < MAX_ALBUMS && !adding && !renaming && (
          <li>
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setDraft("");
              }}
              className="text-xs text-[var(--profile-accent-text)] hover:underline"
            >
              + New album
            </button>
          </li>
        )}
      </ul>

      {isOwner && (adding || renaming) && (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_ALBUM_TITLE}
            placeholder="Album name"
            aria-label={renaming ? "New name for this album" : "Album name"}
            className={`${field} w-48`}
            autoFocus
          />
          <button type="submit" disabled={!draft.trim()} className="rounded-md bg-[var(--profile-accent-fill)] px-3 py-1 text-xs font-medium text-[var(--profile-on-accent)] disabled:opacity-50">
            {renaming ? "Rename" : "Create album"}
          </button>
          <button type="button" onClick={close} className="text-xs text-white/70 hover:underline">
            Cancel
          </button>
        </form>
      )}
      {isOwner && current && !adding && !renaming && (
        <div className="mt-2 flex gap-3 text-xs">
          <button
            type="button"
            onClick={() => {
              setRenaming(true);
              setDraft(current.title);
            }}
            className="text-[var(--profile-accent-text)] hover:underline"
          >
            Rename this album
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Delete the album "${current.title}"? Its pieces stay in your portfolio.`)) return;
              await onDelete(current.id);
            }}
            className="text-red-300 hover:underline"
          >
            Delete this album
          </button>
        </div>
      )}
      {message && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {message}
        </p>
      )}
    </div>
  );
}
