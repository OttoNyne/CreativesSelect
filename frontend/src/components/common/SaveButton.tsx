import { useState } from "react";
import { ApiError } from "../../api/client";
import { savesApi, type SaveKind } from "../../api/saves.api";
import { t } from "../../i18n";

/** Save a post or a piece to your private list, or take it out again. Shows only to someone signed in; says so when it couldn't. */
export function SaveButton({ kind, id, saved, onChange, className = "" }: { kind: SaveKind; id: string; saved: boolean; onChange?: (saved: boolean) => void; className?: string }) {
  const [on, setOn] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (on) await savesApi.unsave(kind, id);
      else await savesApi.save(kind, id);
      setOn(!on);
      onChange?.(!on);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("saves.failed"));
    } finally {
      setBusy(false);
    }
  }

  const label = kind === "posts" ? (on ? t("saves.unsavePost") : t("saves.savePost")) : on ? t("saves.unsavePiece") : t("saves.savePiece");
  return (
    <>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={on} aria-label={label} title={label} className={`hover:text-white disabled:opacity-50 ${on ? "text-violet-300" : ""} ${className}`}>
        <span aria-hidden="true">{on ? "★" : "☆"}</span> {on ? t("saves.saved") : t("saves.save")}
      </button>
      {problem && (
        <span role="alert" className="basis-full text-xs text-red-400">
          {problem}
        </span>
      )}
    </>
  );
}
