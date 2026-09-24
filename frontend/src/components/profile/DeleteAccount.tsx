import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { profilesApi } from "../../api/profiles.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

// Self-service account deletion. Two deliberate steps (open the panel, then
// confirm with the current password) so it can't be triggered by a stray click.
export function DeleteAccount() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await profilesApi.deleteMe(password);
      setUser(null);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete your account, try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-white/40 hover:text-red-400"
      >
        Delete my account…
      </button>
    );
  }

  return (
    <form onSubmit={handleDelete} className="space-y-2 rounded-md border border-red-500/30 bg-red-500/5 p-3">
      <p className="text-xs text-red-200">
        This permanently deletes your profile, posts, comments, friends, uploads and requests. It can't be undone.
      </p>
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Enter your password to confirm"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-red-400 focus:outline-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!password || busy}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Permanently delete account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPassword("");
            setError(null);
          }}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
