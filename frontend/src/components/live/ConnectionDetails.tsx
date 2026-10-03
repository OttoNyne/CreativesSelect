import { useState } from "react";
import { describeNetwork } from "../../lib/live/networkInfo";

/**
 * What the live connection has been doing, in plain lines, for a host whose live misbehaves (it drops, or goes quiet). It can
 * be copied and sent on. It holds nothing private: times, connection states and the phone's own network type.
 */
export function ConnectionDetails({ lines, open = false }: { lines: string[]; open?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = () => [`Network: ${describeNetwork()}`, `Browser: ${navigator.userAgent}`, ...lines].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <details open={open} className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-white/80">
      <summary className="cursor-pointer select-none text-white/80">Connection details</summary>
      <p className="mt-2 text-white/70">{describeNetwork()}</p>
      {lines.length === 0 ? (
        <p className="mt-1 text-white/60">Nothing to report yet.</p>
      ) : (
        <ol aria-label="Connection events" className="mt-2 max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px] text-white/80">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
      <button type="button" onClick={copy} className="mt-2 rounded-md border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10">
        {copied ? "Copied" : "Copy details"}
      </button>
    </details>
  );
}
