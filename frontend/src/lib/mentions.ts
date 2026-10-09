// @mentions in what people write: finding the name being typed (to offer people), putting the chosen one in, and finding the names
// in finished text (to make them links). The text stays plain text throughout.

/** The names as the server counts them: 3 to 30 letters, numbers or underscores, starting a word after an @. */
export const MENTION = /(?<![\w@])@([A-Za-z0-9_]{3,30})(?![\w@])/g;

const TYPING = /(^|[^\w@])@([A-Za-z0-9_]{0,30})$/;

/** The @name being typed just before the caret, or null: where it starts (at the @) and what has been typed after the @. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const match = TYPING.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[2];
  return { start: caret - query.length - 1, query };
}

/** The text with the @name being typed replaced by the chosen person's, and a space after it; and where the caret goes. */
export function insertMention(text: string, caret: number, start: number, username: string): { text: string; caret: number } {
  const after = text.slice(caret);
  const gap = after.startsWith(" ") || after.startsWith("\n") ? "" : " ";
  const inserted = `@${username}${gap}`;
  const next = `${text.slice(0, start)}${inserted}${after}`;
  return { text: next, caret: start + inserted.length + (after.startsWith(" ") ? 1 : 0) };
}

// A #hashtag as the server counts it: 2 to 30 letters, numbers or underscores with at least one letter, starting a word.
const HASHTAG = /(?<![\p{L}\p{N}_#&])#(?=[\p{N}_]*\p{L})([\p{L}\p{N}_]{2,30})(?![\p{L}\p{N}_])/u;
const RICH = new RegExp(`${MENTION.source}|${HASHTAG.source}`, "gu");

export type MentionPiece = { kind: "text"; text: string } | { kind: "mention"; username: string; text: string } | { kind: "hashtag"; tag: string; text: string };

/** Text cut into plain text, @mentions and #hashtags, in order, losing nothing. */
export function splitMentions(text: string): MentionPiece[] {
  const pieces: MentionPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(RICH)) {
    const start = match.index ?? 0;
    if (start > last) pieces.push({ kind: "text", text: text.slice(last, start) });
    if (match[1] !== undefined) pieces.push({ kind: "mention", username: match[1], text: match[0] });
    else pieces.push({ kind: "hashtag", tag: match[2].toLocaleLowerCase(), text: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}
