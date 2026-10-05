// Turning the web addresses in a comment into links, safely. The comment is only ever text: this finds the addresses in it and returns
// the text cut into pieces, so the page can draw plain text and links with no markup of the sender's in between.

export type Piece = { kind: "text"; text: string } | { kind: "link"; url: string; label: string };

/** The most characters of an address that are shown; the whole address is the link's title. */
export const MAX_LABEL = 50;

// What a web address looks like in the text (the server counts the same pattern for its limit of three links per comment).
const ADDRESS = /https?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?]+$/;
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** An address without the punctuation around it in a sentence: "(see https://a.com/x)." is https://a.com/x. */
function trimAddress(raw: string): string {
  let text = raw;
  for (;;) {
    const before = text;
    text = text.replace(TRAILING, "");
    const last = text[text.length - 1];
    // a closing bracket belongs to the address only if it has an opening one in it (a Wikipedia address ends in one)
    if (last && CLOSERS[last] && (text.split(last).length - 1) > (text.split(CLOSERS[last]).length - 1)) text = text.slice(0, -1);
    if (text === before) return text;
  }
}

/** The address to link to, or null if it shouldn't be a link: it must parse, be http or https, have a host, and have no name or password. */
export function safeUrl(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname.includes(".") || url.username || url.password) return null;
  return url.toString();
}

const labelOf = (address: string) => {
  const bare = address.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return bare.length > MAX_LABEL ? `${bare.slice(0, MAX_LABEL - 1)}…` : bare;
};

/** The text as pieces: plain text and links, in order, losing nothing. A web address that isn't safe to link stays as text. */
export function splitLinks(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const end = pieces[pieces.length - 1];
    if (end?.kind === "text") end.text += t;
    else pieces.push({ kind: "text", text: t });
  };
  for (const match of text.matchAll(ADDRESS)) {
    const start = match.index ?? 0;
    const address = trimAddress(match[0]);
    const url = safeUrl(address);
    push(text.slice(last, start));
    if (url) {
      pieces.push({ kind: "link", url, label: labelOf(address) });
      push(match[0].slice(address.length));
    } else {
      push(match[0]);
    }
    last = start + match[0].length;
  }
  push(text.slice(last));
  return pieces;
}
