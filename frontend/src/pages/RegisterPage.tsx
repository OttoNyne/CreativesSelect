import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
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
      const { user } = await authApi.register(form);
      setUser(user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-bold text-white">Join CreativesSelect</h1>
      <p className="mt-1 text-sm text-white/50">A safe space for creatives to network, collab, and show off work.</p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <input
          required
          placeholder="Display name"
          value={form.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
        />
        <input
          required
          placeholder="Username"
          value={form.username}
          onChange={(e) => update("username", e.target.value.replace(/\s/g, ""))}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
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

      <p className="mt-4 text-center text-sm text-white/50">
        Already have an account?{" "}
        <Link to="/login" className="text-violet-400 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
