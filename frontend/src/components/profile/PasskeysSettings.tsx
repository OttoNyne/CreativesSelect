import { useState } from "react";
import { ApiError } from "../../api/client";
import { passkeysApi, type Passkey } from "../../api/passkeys.api";
import { PasskeyError, createPasskey, passkeysSupported } from "../../lib/passkeys";
import { agoText } from "../../lib/when";

type View =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; passkeys: Passkey[]; rpId: string; max: number };
type Editing = { kind: "none" } | { kind: "add" } | { kind: "rename"; id: string } | { kind: "remove"; id: string };

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";
const button = "rounded-md border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50";
const primary = "rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50";

/** Whether this page is on the address the passkeys were made for: a passkey is only ever offered by the browser on its own site. */
const onTheRightSite = (rpId: string) => location.hostname === rpId || location.hostname.endsWith(`.${rpId}`);

/**
 * Passkeys in the owner's own settings: the keys kept on their devices that can sign them in without a password. Adding one asks for the
 * password again (and a code, if two-step sign-in is on) and then for the device's own fingerprint, face or PIN.
 */
export function PasskeysSettings() {
  const [view, setView] = useState<View>({ kind: "closed" });
  const [editing, setEditing] = useState<Editing>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [name, setName] = useState("");

  function reset(next: Editing = { kind: "none" }) {
    setEditing(next);
    setError(null);
    setPassword("");
    setCode("");
    setNeedsCode(false);
    setName("");
  }

  async function open() {
    setView({ kind: "loading" });
    try {
      const { passkeys, rpId, max } = await passkeysApi.list();
      setView({ kind: "loaded", passkeys, rpId, max });
    } catch (err) {
      setView({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't load your passkeys, try again." });
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || view.kind !== "loaded") return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const options = await passkeysApi.registerOptions(password, needsCode ? code : undefined);
      const response = await createPasskey(options); // the device's own prompt
      const { passkey } = await passkeysApi.registerVerify(response, name.trim() || undefined);
      setView({ ...view, passkeys: [...view.passkeys, passkey] });
      reset();
      setMessage(`Added “${passkey.name}”. You can now sign in with it.`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "second_step_needed") {
        setNeedsCode(true);
        setError(code ? err.message : "Enter a code from your authenticator app (or a recovery code) to go on.");
        setCode("");
      } else if (err instanceof PasskeyError && err.reason === "cancelled") {
        setError(err.message);
      } else {
        setError(err instanceof ApiError || err instanceof PasskeyError ? err.message : "Couldn't add the passkey, try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function rename(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (busy || view.kind !== "loaded") return;
    setBusy(true);
    setError(null);
    try {
      const { passkey } = await passkeysApi.rename(id, name);
      setView({ ...view, passkeys: view.passkeys.map((p) => (p.id === id ? passkey : p)) });
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't rename it, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (busy || view.kind !== "loaded") return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await passkeysApi.remove(id, password);
      const gone = view.passkeys.find((p) => p.id === id);
      setView({ ...view, passkeys: view.passkeys.filter((p) => p.id !== id) });
      reset();
      setMessage(`Removed “${gone?.name ?? "the passkey"}”.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await open(); // already gone: the list was out of date
        reset();
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't remove it, try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === "closed") {
    return (
      <button type="button" onClick={open} className="block text-xs text-white/60 hover:text-white">
        Passkeys…
      </button>
    );
  }

  const errorLine = error && (
    <p role="alert" className="text-xs text-red-400">
      {error}
    </p>
  );

  return (
    <section aria-label="Passkeys" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">Passkeys</h3>
      {view.kind === "loading" && <p className="text-xs text-white/60">Loading…</p>}
      {view.kind === "error" && (
        <>
          <p role="alert" className="text-xs text-red-400">
            {view.message}
          </p>
          <button type="button" onClick={open} className={button}>
            Try again
          </button>
        </>
      )}

      {view.kind === "loaded" && (
        <>
          <p className="text-xs text-white/60">
            A passkey lets you log in with your fingerprint, face or device PIN instead of a password. It stays on your device, can&apos;t be typed into a fake login page, and counts as both your password and your two-step code.
          </p>
          {!passkeysSupported() && <p className="text-xs text-amber-300">This browser can&apos;t use passkeys. Try a recent Chrome, Safari, Edge or Firefox.</p>}
          {passkeysSupported() && !onTheRightSite(view.rpId) && <p className="text-xs text-amber-300">Passkeys work on {view.rpId} only. Open the site there to add or use one.</p>}

          {view.passkeys.length === 0 ? (
            <p className="text-xs text-white/60">You haven&apos;t added any passkeys yet.</p>
          ) : (
            <ul className="space-y-1.5" aria-label="Your passkeys">
              {view.passkeys.map((p) => (
                <li key={p.id} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-xs text-white/85">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-[11px] text-white/60">
                        Added {agoText(p.createdAt)} · {p.lastUsedAt ? `used ${agoText(p.lastUsedAt)}` : "never used"}
                        {p.synced ? " · synced between your devices" : ""}
                      </span>
                    </span>
                    {editing.kind === "none" && (
                      <span className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => {
                            reset({ kind: "rename", id: p.id });
                            setName(p.name);
                          }} aria-label={`Rename ${p.name}`} className={button}>
                          Rename
                        </button>
                        <button type="button" onClick={() => reset({ kind: "remove", id: p.id })} aria-label={`Remove ${p.name}`} className={button}>
                          Remove
                        </button>
                      </span>
                    )}
                  </div>
                  {editing.kind === "rename" && editing.id === p.id && (
                    <form onSubmit={(e) => rename(e, p.id)} className="mt-2 space-y-2">
                      <input aria-label="New name" maxLength={40} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
                      {errorLine}
                      <div className="flex gap-2">
                        <button type="submit" disabled={!name.trim() || busy} className={primary}>
                          Save name
                        </button>
                        <button type="button" onClick={() => reset()} className={button}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  {editing.kind === "remove" && editing.id === p.id && (
                    <form onSubmit={(e) => remove(e, p.id)} className="mt-2 space-y-2">
                      <p className="text-xs text-white/70">Enter your password to remove this passkey.</p>
                      <input type="password" autoComplete="current-password" aria-label="Your password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
                      {errorLine}
                      <div className="flex gap-2">
                        <button type="submit" disabled={!password || busy} className={primary}>
                          {busy ? "Removing…" : "Remove passkey"}
                        </button>
                        <button type="button" onClick={() => reset()} className={button}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {editing.kind === "add" ? (
            <form onSubmit={add} aria-label="Add a passkey" className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-white/70">Enter your password, then your device will ask for your fingerprint, face or PIN.</p>
              <input type="password" autoComplete="current-password" aria-label="Your password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              {needsCode && <input autoComplete="one-time-code" aria-label="Code from your app" placeholder="Code from your app" maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} className={field} />}
              <input aria-label="Name for this passkey (optional)" placeholder="Name for this passkey (optional), such as My phone" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={field} />
              {errorLine}
              <div className="flex gap-2">
                <button type="submit" disabled={!password || (needsCode && !code.trim()) || busy} className={primary}>
                  {busy ? "Waiting for your device…" : "Add passkey"}
                </button>
                <button type="button" onClick={() => reset()} className={button}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            editing.kind === "none" &&
            passkeysSupported() &&
            onTheRightSite(view.rpId) &&
            view.passkeys.length < view.max && (
              <button type="button" onClick={() => reset({ kind: "add" })} className={button}>
                Add a passkey
              </button>
            )
          )}
          {editing.kind === "none" && view.passkeys.length >= view.max && <p className="text-xs text-white/60">You have the most passkeys allowed ({view.max}). Remove one to add another.</p>}
          {message && (
            <p role="status" className="text-xs text-emerald-400">
              {message}
            </p>
          )}
        </>
      )}
      {editing.kind === "none" && (
        <button type="button" onClick={() => setView({ kind: "closed" })} className="text-xs text-white/60 hover:text-white">
          Close
        </button>
      )}
    </section>
  );
}
