import { useState } from "react";
import { t } from "../../i18n";

/** The text to put in another website's page: an iframe pointing at the card, which loads from this site and links back to it. */
export function embedSnippet(kind: "piece" | "profile", id: string, title: string, origin: string = window.location.origin): string {
  const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const height = kind === "piece" ? 420 : 360;
  return `<iframe src="${attr(`${origin}/embed/${kind}/${encodeURIComponent(id)}`)}" title="${attr(title)}" width="480" height="${height}" style="border:0;max-width:100%" loading="lazy"></iframe>`;
}

/** A live preview of the card and the iframe text to copy. */
export function EmbedCode({ kind, id, title }: { kind: "piece" | "profile"; id: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const code = embedSnippet(kind, id, title);
  const boxId = `embed-code-${kind}-${id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard permission: the text is selected in the box for the person to copy themselves
      const box = document.getElementById(boxId) as HTMLTextAreaElement | null;
      box?.focus();
      box?.select();
    }
  }

  return (
    <div className="space-y-2">
      <iframe src={`/embed/${kind}/${encodeURIComponent(id)}`} title={t("embed.previewTitle")} loading="lazy" className="h-[320px] w-full max-w-md rounded-lg border border-white/10 bg-black/40" />
      <label className="block text-xs text-white/70" htmlFor={boxId}>
        {t("embed.codeLabel")}
      </label>
      <textarea
        id={boxId}
        readOnly
        value={code}
        rows={3}
        dir="ltr"
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-white focus:border-violet-500 focus:outline-none"
      />
      <button type="button" onClick={copy} className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/10">
        {copied ? t("embed.copied") : t("embed.copy")}
      </button>
    </div>
  );
}
