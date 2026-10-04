import { useState } from "react";
import { useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { authApi } from "../api/auth.api";
import { invitesApi } from "../api/invites.api";
import { Avatar } from "../components/common/Avatar";
import type { Inviter } from "../types";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function RegisterPage() {
  const { user: signedIn, setUser } = useAuth();
  const { code } = useParams();
  const navigate = useNavigate();
  // Arriving through an invite link: who is inviting, or that the link can't be used any more (they can still sign up).
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [inviteState, setInviteState] = useState<"none" | "checking" | "valid" | "invalid">(code ? "checking" : "none");
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    invitesApi
      .preview(code)
      .then(({ inviter }) => {
        if (cancelled) return;
        setInviter(inviter);
        setInviteState("valid");
      })
      .catch(() => !cancelled && setInviteState("invalid"));
    return () => {
      cancelled = true;
    };
  }, [code]);
  const [form, setForm] = useState({ email: "", username: "", displayName: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user, invitedBy } = await authApi.register({ ...form, ...(code && inviteState !== "invalid" ? { invite: code } : {}) });
      setUser(user);
      // came in through someone's link: show them their new friend; otherwise the feed
      navigate(invitedBy ? "/friends" : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-bold text-white">Join CreativesSelect</h1>
      <p className="mt-1 text-sm text-white/60">A safe space for creatives to network, collab, and show off work.</p>

      {signedIn && code && (
        <p role="status" className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          You&apos;re already signed in. <Link to="/" className="text-violet-400 hover:underline">Go to your feed</Link>.
        </p>
      )}
      {inviteState === "valid" && inviter && (
        <div role="status" className="mt-4 flex items-center gap-3 rounded-md border border-violet-400/40 bg-violet-500/10 p-3 text-sm text-white">
          <Avatar username={inviter.username} displayName={inviter.displayName} avatarUrl={inviter.avatarUrl} size={36} />
          <span>
            <strong>{inviter.displayName}</strong> invited you. You&apos;ll be friends as soon as you sign up.
          </span>
        </div>
      )}
      {inviteState === "invalid" && (
        <p role="status" className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          This invite link isn&apos;t valid any more. You can still sign up, and find your friend by searching for them.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <input
          required
          placeholder="Display name"
          value={form.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        <input
          required
          placeholder="Username"
          value={form.username}
          onChange={(e) => update("username", e.target.value.replace(/\s/g, ""))}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9_]+"
          title="3–30 letters, numbers or underscores"
          aria-describedby="username-hint"
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        <p id="username-hint" className="-mt-1 text-[11px] text-white/60">
          Your profile address: 3–30 letters, numbers or underscores.
        </p>
        <input
          type="email"
          required
          placeholder="Email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-white/60">
        Already have an account?{" "}
        <Link to="/login" className="text-violet-400 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
