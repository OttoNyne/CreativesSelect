import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { passkeysApi } from "../api/passkeys.api";
import { PasskeyError, passkeysSupported, signInWithPasskey } from "../lib/passkeys";
import { t } from "../i18n";

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once the password was right and the person has two-step sign-in on: the note to send back with the code from their app.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.login({ email, password });
      if ("twoFactorRequired" in result) {
        setChallenge(result.challenge);
        return;
      }
      setUser(result.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.somethingWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await authApi.loginTwoFactor(challenge, code);
      setUser(user);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "challenge_expired") {
        // Too long since the password was entered (or it changed): start again from the password.
        setChallenge(null);
        setPassword("");
      }
      setCode("");
      setError(err instanceof ApiError ? err.message : t("common.somethingWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  // The device holds the key and asks the person (fingerprint, face or PIN): no password and no code are typed.
  async function handlePasskey() {
    setError(null);
    setSubmitting(true);
    try {
      const options = await passkeysApi.loginOptions();
      const response = await signInWithPasskey(options);
      const { user } = await passkeysApi.loginVerify(response);
      setUser(user);
      navigate("/");
    } catch (err) {
      // closing the prompt is not an error worth shouting about
      setError(err instanceof PasskeyError && err.reason === "cancelled" ? null : err instanceof ApiError || err instanceof PasskeyError ? err.message : t("common.somethingWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setChallenge(null);
    setCode("");
    setPassword("");
    setError(null);
  }

  if (challenge) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h1 className="text-xl font-bold text-white">{t("login.twoStep.title")}</h1>
        <p className="mt-2 text-sm text-white/70">{t("login.twoStep.intro")}</p>
        <form onSubmit={handleCode} className="mt-4 space-y-3">
          <label className="block text-xs text-white/70" htmlFor="login-code">
            {t("login.twoStep.label")}
          </label>
          <input
            id="login-code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={40}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm tracking-widest text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <p className="text-xs text-white/60">{t("login.twoStep.recoveryHint")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="w-full rounded-md bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {submitting ? t("common.checking") : t("common.continue")}
          </button>
          <button type="button" onClick={startOver} className="w-full text-center text-xs text-white/60 hover:text-white">
            {t("common.backToLogin")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-bold text-white">{t("login.title")}</h1>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <input
          type="email"
          required
          placeholder={t("common.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        <input
          type="password"
          required
          placeholder={t("common.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="text-end">
          <Link to="/forgot-password" className="text-xs text-violet-400 hover:underline">
            {t("login.forgot")}
          </Link>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>

      {passkeysSupported() && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handlePasskey}
            disabled={submitting}
            className="w-full rounded-md border border-white/20 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            {t("login.passkey")}
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-sm text-white/60">
        {t("login.noAccount")}{" "}
        <Link to="/register" className="text-violet-400 hover:underline">
          {t("common.signUp")}
        </Link>
      </p>
    </div>
  );
}
