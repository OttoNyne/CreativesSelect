import { useState } from "react";
import { ApiError } from "../../api/client";
import { profilesApi } from "../../api/profiles.api";
import { useAuth } from "../../context/AuthContext";
import { t } from "../../i18n";
import type { MediaItem } from "../../types";
import { EmbedCode } from "./EmbedCode";

/** On one of your own pieces: switch embedding on for your work if it isn't, and get the iframe text for this piece. */
export function EmbedPiecePanel({ item }: { item: MediaItem }) {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = user?.allowEmbeds === true;

  async function allow(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { user: saved } = await profilesApi.updateMe({ allowEmbeds: on });
      setUser(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("embed.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-white/10 bg-black/20 px-3 py-3">
      <h3 className="text-sm font-medium text-white">{t("embed.heading")}</h3>
      {user?.isPrivate ? (
        <p className="text-xs text-white/70">{t("embed.private")}</p>
      ) : (
        <>
          <label className="flex items-start gap-2 text-xs text-white/80">
            <input type="checkbox" checked={allowed} disabled={busy} onChange={(e) => allow(e.target.checked)} className="mt-0.5" />
            <span>{t("embed.allow")}</span>
          </label>
          <p className="text-xs text-white/60">{t("embed.allowHint")}</p>
          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}
          {allowed && <EmbedCode kind="piece" id={item.id} title={t("embed.frameTitle", { name: item.caption || user?.displayName || "" })} />}
        </>
      )}
    </div>
  );
}
