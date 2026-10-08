import { useState } from "react";
import { profilesApi } from "../../api/profiles.api";
import { ApiError } from "../../api/client";
import type { User } from "../../types";
import { t } from "../../i18n";

const usernameHint = () => t("profile.usernameHint");
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

// Edit panel: change your display name and your @username. Both save on their
// own button (with their own inline errors) so a rejected username never
// blocks saving the rest of the profile.
export function ProfileNames({ profile, onChanged }: { profile: User; onChanged: (user: User) => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [nameBusy, setNameBusy] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [userMsg, setUserMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const nameChanged = displayName.trim() !== profile.displayName;
  const userChanged = username.trim().toLowerCase() !== profile.username;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!nameChanged || nameBusy) return;
    if (!displayName.trim()) return setNameMsg({ ok: false, text: t("profile.displayNameEmpty") });
    setNameBusy(true);
    setNameMsg(null);
    try {
      const { user } = await profilesApi.updateMe({ displayName: displayName.trim() });
      setDisplayName(user.displayName);
      onChanged(user);
      setNameMsg({ ok: true, text: t("profile.displayNameUpdated") });
    } catch (err) {
      setNameMsg({ ok: false, text: err instanceof ApiError ? err.message : t("profile.couldntChangeYourDisplay") });
    } finally {
      setNameBusy(false);
    }
  }

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!userChanged || userBusy) return;
    if (!USERNAME_PATTERN.test(username.trim())) return setUserMsg({ ok: false, text: t("profile.usernameMustBe", { hint: usernameHint() }) });
    setUserBusy(true);
    setUserMsg(null);
    try {
      const { user } = await profilesApi.changeUsername(username.trim());
      onChanged(user); // the page moves to the new /u/… address
    } catch (err) {
      setUserMsg({ ok: false, text: err instanceof ApiError ? err.message : t("profile.couldntChangeYourUsername") });
      setUserBusy(false);
    }
  }

  const input =
    "min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:outline-none";
  const button =
    "rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-40";

  return (
    <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
      <form onSubmit={saveName} className="space-y-1">
        <label className="block text-xs text-white/60" htmlFor="display-name">
          {t("register.displayName")}
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            className={input}
          />
          <button type="submit" disabled={!nameChanged || nameBusy} className={button}>
            {nameBusy ? t("reset.saving") : t("profile.saveName")}
          </button>
        </div>
        {nameMsg && <p className={`text-xs ${nameMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{nameMsg.text}</p>}
      </form>

      <form onSubmit={saveUsername} className="space-y-1">
        <label className="block text-xs text-white/60" htmlFor="username">
          {t("profile.usernameLabel")} <span className="text-white/60">{t("profile.usernameAddress", { address: username.trim().toLowerCase() || "…" })}</span>
        </label>
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-md border border-white/10 bg-black/30 ps-3 focus-within:border-white/30">
            <span className="text-sm text-white/60">@</span>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-white focus:outline-none"
            />
          </div>
          <button type="submit" disabled={!userChanged || userBusy} className={button}>
            {userBusy ? t("profile.changing") : t("profile.changeUsername")}
          </button>
        </div>
        <p className="text-[11px] text-white/60">
          {t("profile.usernameRules", { hint: usernameHint() })}
        </p>
        {userMsg && <p className={`text-xs ${userMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{userMsg.text}</p>}
      </form>
    </div>
  );
}
