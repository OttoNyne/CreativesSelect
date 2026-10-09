import { useState } from "react";
import { ApiError } from "../../api/client";
import { mutesApi } from "../../api/mutes.api";
import { t } from "../../i18n";

/** Mute or unmute someone from their profile: quieter than blocking, nobody is told. Says so when it couldn't be done. */
export function MuteButton({ username, displayName, muted, onChange }: { username: string; displayName: string; muted: boolean; onChange: (muted: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (muted) await mutesApi.unmute(username);
      else await mutesApi.mute(username);
      onChange(!muted);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("mutes.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={muted}
        aria-label={muted ? t("mutes.unmuteLabel", { name: displayName }) : t("mutes.muteLabel", { name: displayName })}
        className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${muted ? "border-white/30 bg-white/10" : "border-white/20"}`}
      >
        {muted ? t("mutes.unmute") : t("mutes.mute")}
      </button>
      {problem && (
        <span role="alert" className="basis-full text-xs text-red-400">
          {problem}
        </span>
      )}
    </>
  );
}
