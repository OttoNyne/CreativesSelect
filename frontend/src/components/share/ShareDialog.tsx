import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { qrCodeFor } from "../../lib/share";
import { t } from "../../i18n";

export interface ShareDialogProps {
  /** What the QR code and the link open. */
  url: string;
  title: string;
  /** One line under the title saying what is being shared. */
  description?: string;
  onClose: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * A window with a scannable QR code for a link, the link itself to copy, and (on phones and anywhere the browser offers it)
 * the device's own share sheet. It is drawn straight into the page body so a profile's colours can't change how it looks.
 */
export function ShareDialog({ url, title, description, onClose }: ShareDialogProps) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  // The page may re-render often (a live room does, every few seconds); the window must not react to that.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
    qrCodeFor(url)
      .then((data) => !cancelled && setQr(data))
      .catch(() => !cancelled && setQrFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function handleCopy() {
    const ok = await copyText(url);
    if (!ok) linkRef.current?.select(); // the browser blocked clipboard access: leave the link selected to copy by hand
    setCopied(ok ? "yes" : "no");
  }

  async function handleShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      // closing the share sheet is not an error
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => onCloseRef.current()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16161d] p-5 text-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="share-title" className="text-lg font-bold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-white/70">{description}</p>}
          </div>
          <button ref={closeRef} onClick={() => onCloseRef.current()} aria-label={t("common.close")} className="rounded-md border border-white/15 px-2.5 py-1 text-sm text-white/80 hover:bg-white/10">
            ✕
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          {qr ? (
            <img src={qr} alt={t("media.qrAlt", { url })} data-testid="share-qr" width={224} height={224} className="rounded-xl bg-white" />
          ) : qrFailed ? (
            <p role="alert" className="py-8 text-center text-sm text-red-400">
              {t("media.couldntMakeTheQr")}
            </p>
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-white/10 text-sm text-white/70">{t("media.makingYourQrCode")}</div>
          )}
        </div>
        <p className="mt-2 text-center text-sm text-white/70">{t("media.pointAPhonesCamera")}</p>

        <div className="mt-4 flex gap-2">
          <input
            ref={linkRef}
            readOnly
            value={url}
            aria-label={t("media.link")}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
          />
          <button onClick={handleCopy} className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500">
            {t("media.copyLink")}
          </button>
        </div>
        <p role="status" className="mt-1 min-h-5 text-xs text-white/70">
          {copied === "yes" ? t("media.linkCopied") : copied === "no" ? t("media.couldntCopyAutomaticallyThe") : ""}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {canShare && (
            <button onClick={handleShare} className="rounded-md border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10">
              {t("media.share")}
            </button>
          )}
          {qr && (
            <a href={qr} download="creativesselect-qr.png" className="rounded-md border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10">
              {t("media.saveQrCode")}
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
