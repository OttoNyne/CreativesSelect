import { useState } from "react";
import { ApiError } from "../../api/client";
import { profilesApi } from "../../api/profiles.api";
import { t } from "../../i18n";

/** Saves a file the way a link would: with a short-lived address, never a page change. */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** "Download my data" in the owner's own settings: everything they've written or chosen, as one file, after asking for the password again. */
export function DownloadMyData() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function download(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const { blob, filename } = await profilesApi.exportData(password);
      saveFile(blob, filename);
      setSaved(filename);
      setPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.couldntPrepareYourData"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block text-xs text-white/60 hover:text-white">
        {t("settings.downloadMyData")}
      </button>
    );
  }

  return (
    <section aria-label={t("settings.downloadMyData2")} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("settings.downloadMyData2")}</h3>
      <p className="text-xs text-white/60">
        {t("settings.getAFileWith")}
      </p>
      <form onSubmit={download} className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
        <input
          type="password"
          autoComplete="current-password"
          placeholder={t("settings.yourPassword")}
          aria-label={t("settings.yourPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
        />
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-xs text-emerald-400">
            {t("settings.savedAs", { name: saved })}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={!password || busy} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {busy ? t("settings.preparing") : t("settings.download")}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPassword("");
              setError(null);
              setSaved(null);
            }}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            {t("common.close")}
          </button>
        </div>
      </form>
    </section>
  );
}
