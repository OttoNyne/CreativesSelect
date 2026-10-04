// Tags describe what someone does ("illustrator", "lo-fi producer"). The server keeps them in this form; the same rules are
// applied here so a tag is checked, and shown, before it is sent.

export const MAX_TAGS = 8;
export const MIN_TAG = 2;
export const MAX_TAG = 24;
export const MAX_MOOD = 60;
export const MAX_LISTENING = 80;

const TAG = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;

/** A tag as it will be stored: lower case, no leading #, single spaces. */
export function normalizeTag(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*/g, "-");
}

export const isValidTag = (tag: string) => tag.length >= MIN_TAG && tag.length <= MAX_TAG && TAG.test(tag);

/** Why a typed tag can't be added, or null if it can. */
export function tagProblem(raw: string, existing: string[]): string | null {
  const tag = normalizeTag(raw);
  if (!tag) return null; // nothing typed: nothing to say
  if (!isValidTag(tag)) return `Use ${MIN_TAG}–${MAX_TAG} letters, numbers, spaces or hyphens`;
  if (existing.includes(tag)) return `You already have "${tag}"`;
  if (existing.length >= MAX_TAGS) return `You can have up to ${MAX_TAGS} tags`;
  return null;
}
