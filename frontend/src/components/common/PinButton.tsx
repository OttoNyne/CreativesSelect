import { useState } from "react";
import { ApiError } from "../../api/client";
import { mediaApi } from "../../api/media.api";
import { postsApi } from "../../api/posts.api";
import { t } from "../../i18n";

/**
 * For the owner: put one of their own posts at the top of their profile ("pin"), or one of their own pieces first in their portfolio
 * ("feature"), or take it off again. One of each at a time. Says so when it couldn't be done.
 */
export function PinButton({ kind, id, on, onChange, className = "" }: { kind: "post" | "piece"; id: string; on: boolean; onChange?: (on: boolean) => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (kind === "post") await (on ? postsApi.unpin(id) : postsApi.pin(id));
      else await (on ? mediaApi.unfeature(id) : mediaApi.feature(id));
      onChange?.(!on);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("pinned.failed"));
    } finally {
      setBusy(false);
    }
  }

  const words = kind === "post" ? (on ? t("pinned.unpin") : t("pinned.pin")) : on ? t("pinned.unfeature") : t("pinned.feature");
  const label = kind === "post" ? (on ? t("pinned.unpinLabel") : t("pinned.pinLabel")) : on ? t("pinned.unfeatureLabel") : t("pinned.featureLabel");
  return (
    <>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={on} aria-label={label} title={label} className={`hover:text-white disabled:opacity-50 ${on ? "text-violet-300" : ""} ${className}`}>
        <span aria-hidden="true">📌</span> {words}
      </button>
      {problem && (
        <span role="alert" className="basis-full text-xs text-red-400">
          {problem}
        </span>
      )}
    </>
  );
}
