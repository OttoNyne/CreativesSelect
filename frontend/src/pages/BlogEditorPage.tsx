import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { blogApi, MAX_BLOG_BODY, MAX_BLOG_TITLE } from "../api/blog.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

// Write a new entry (/blog/new) or change one of your own (/blog/:id/edit).
export function BlogEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "missing">(id ? "loading" : "ready");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    blogApi
      .get(id)
      .then(({ entry }) => {
        if (cancelled) return;
        // only your own entries can be changed
        if (!entry.isAuthor) return setState("missing");
        setTitle(entry.title);
        setBody(entry.body);
        setState("ready");
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!title.trim()) return setError("Give your entry a title");
    if (!body.trim()) return setError("Write something in your entry");
    setSaving(true);
    setError(null);
    try {
      const { entry } = id ? await blogApi.update(id, { title, body }) : await blogApi.create({ title, body });
      navigate(`/blog/${entry.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your entry.");
      setSaving(false);
    }
  }

  const back = id ? `/blog/${id}` : user ? `/u/${user.username}#blog` : "/";

  if (state === "loading") return <p className="p-8 text-center text-white/60">Loading…</p>;
  if (state === "missing") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p role="alert" className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/70">
          This entry isn&apos;t available to change.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
      <Link to={back} className="text-sm text-violet-400 hover:underline">
        ← Back
      </Link>
      <h1 className="text-xl font-semibold text-white">{id ? "Edit entry" : "New entry"}</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_BLOG_TITLE} placeholder="Title" aria-label="Entry title" className={field} />
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_BLOG_BODY}
            rows={14}
            placeholder="Write here. Leave a blank line between paragraphs."
            aria-label="Entry text"
            className={`${field} leading-relaxed`}
          />
          <p className="mt-1 text-right text-xs text-white/60" aria-live="polite">
            {body.length.toLocaleString()} / {MAX_BLOG_BODY.toLocaleString()}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {saving ? "Saving…" : id ? "Save changes" : "Publish"}
          </button>
          <Link to={back} className="rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
