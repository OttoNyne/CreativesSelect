import { useState } from "react";
import { ApiError } from "../../api/client";
import { moderationApi, type ReportTarget } from "../../api/moderation.api";
import { t } from "../../i18n";

/**
 * Report something to the moderators: a button that opens a small box for the reason, and says thanks once it is sent. Shown to someone
 * signed in, for something that isn't theirs (the page decides). `label` names what is being reported, for screen readers.
 */
export function ReportButton({ targetType, targetId, label, className = "" }: { targetType: ReportTarget; targetId: string; label: string; className?: string }) {
  const [state, setState] = useState<"closed" | "open" | "sent">("closed");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await moderationApi.report(targetType, targetId, reason.trim());
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("report.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (state === "sent") {
    return (
      <span role="status" className="text-xs text-white/70">
        {t("report.thanks")}
      </span>
    );
  }
  if (state === "closed") {
    return (
      <button type="button" onClick={() => setState("open")} aria-label={label} className={`hover:text-white ${className}`}>
        {t("report.button")}
      </button>
    );
  }
  return (
    <form onSubmit={send} className="basis-full space-y-1.5">
      <label className="block text-xs text-white/70">
        {t("report.reasonLabel")}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} dir="auto" placeholder={t("report.reasonPlaceholder")} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none" />
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || !reason.trim()} className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? t("report.sending") : t("report.send")}
        </button>
        <button type="button" onClick={() => setState("closed")} disabled={busy} className="text-xs text-white/70 hover:text-white hover:underline disabled:opacity-50">
          {t("report.cancel")}
        </button>
      </div>
    </form>
  );
}
