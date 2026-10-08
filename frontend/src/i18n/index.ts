import { en } from "./locales/en";

// The site in more than one language. English is always there (it is what every other language falls back to), and the others are loaded
// only when someone uses them. The language is chosen once, when the page loads (from the person's choice, else their browser's), and
// changing it reloads the page: that keeps every piece of text, date and number in one language at once, without each part of the page
// having to notice the change.
export type Language = "en" | "es" | "ar";

export const LANGUAGES: readonly { code: Language; name: string; dir: "ltr" | "rtl"; locale: string }[] = [
  { code: "en", name: "English", dir: "ltr", locale: "en" },
  { code: "es", name: "Español", dir: "ltr", locale: "es" },
  // Western digits (0-9) in dates and numbers, as most Arabic websites use.
  { code: "ar", name: "العربية", dir: "rtl", locale: "ar-u-nu-latn" },
];

/** A piece of text: plain, or one text per plural form (Spanish needs "one" and "other"; Arabic has six). {name} marks where a value goes. */
export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);
export type Catalog = Record<string, Message>;
export type Key = keyof typeof en;
export type Params = Record<string, string | number>;

export const STORAGE_KEY = "cs-language";

const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.code === value);

/** The language to use: what the person chose, else the first language their browser asks for that the site has, else English. */
export function detectLanguage(chosen: string | null | undefined, browser: readonly string[] | undefined): Language {
  if (isLanguage(chosen)) return chosen;
  for (const tag of browser ?? []) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (isLanguage(base)) return base;
  }
  return "en";
}

function readChoice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: Language = detectLanguage(readChoice(), typeof navigator === "undefined" ? undefined : navigator.languages ?? [navigator.language]);
let catalog: Partial<Record<Key, Message>> = {};
let serverCatalog: Record<string, string> = {};
// Server messages with a value in them ("Titles can be up to {v1} characters") are matched by their shape rather than word for word.
let serverPatterns: { re: RegExp; names: string[]; text: string }[] = [];

function compileServerPatterns(catalog: Record<string, string>) {
  return Object.entries(catalog)
    .filter(([key]) => /\{v\d+\}/.test(key))
    .map(([key, text]) => ({
      re: new RegExp("^" + key.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{v\d+\}/g, "(.+?)") + "$"),
      names: [...key.matchAll(/\{(v\d+)\}/g)].map((m) => m[1]),
      text,
    }));
}

export const language = (): Language => current;
const info = () => LANGUAGES.find((l) => l.code === current)!;
export const isRtl = () => info().dir === "rtl";
/** The locale for dates and numbers (a BCP 47 tag). */
export const locale = () => info().locale;

/** Loads the catalogs for the language in use. Awaited once before the page is first drawn; English needs no loading. */
export async function initI18n(code: Language = current): Promise<void> {
  current = isLanguage(code) ? code : "en";
  if (current === "en") {
    catalog = {};
    serverCatalog = {};
    serverPatterns = [];
  } else {
    try {
      const loaded = current === "es" ? await import("./locales/es") : await import("./locales/ar");
      catalog = loaded.messages;
      serverCatalog = loaded.server;
      serverPatterns = compileServerPatterns(serverCatalog);
    } catch {
      // the language's file couldn't be fetched (offline, a bad connection): the page is shown in English rather than not at all
      current = "en";
      catalog = {};
      serverCatalog = {};
      serverPatterns = [];
    }
  }
  applyDocumentLanguage();
}

/** Tells the browser which language and direction the page is in (for screen readers, hyphenation, and mirroring the layout). */
export function applyDocumentLanguage(doc: Document | undefined = typeof document === "undefined" ? undefined : document) {
  if (!doc) return;
  doc.documentElement.lang = current;
  doc.documentElement.dir = info().dir;
}

const fill = (text: string, params?: Params) => (params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? format(params[name]) : whole)) : text);
const format = (value: string | number) => (typeof value === "number" ? new Intl.NumberFormat(locale()).format(value) : value);

/** The text for `key` in the language in use (English if it hasn't been translated), with {name} filled from `params`. For a plural, `params.n` picks the form. */
export function t(key: Key, params?: Params): string {
  const message: Message | undefined = catalog[key] ?? en[key];
  if (message === undefined) return String(key);
  if (typeof message === "string") return fill(message, params);
  const n = Number(params?.n);
  const form = Number.isFinite(n) ? new Intl.PluralRules(locale()).select(n) : "other";
  return fill(message[form] ?? message.other, params);
}

/** What the server said (always English), in the language in use if we have it. Anything we don't have is shown as it came. */
export function translateServerMessage(message: string): string {
  const exact = serverCatalog[message];
  if (exact !== undefined) return exact;
  for (const { re, names, text } of serverPatterns) {
    const match = re.exec(message);
    if (match) return text.replace(/\{(v\d+)\}/g, (whole, name: string) => match[names.indexOf(name) + 1] ?? whole);
  }
  return message;
}

/** Changes the language and reloads the page, so everything on it changes together. */
export function setLanguage(code: Language) {
  if (!isLanguage(code)) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // private browsing may refuse; the browser's own language is used then
  }
  window.location.reload();
}

/** For tests: switch language without reloading. */
export async function switchLanguageForTests(code: Language) {
  await initI18n(code);
}

/** What a translation file for an area must contain: a text for every key the English one has (checked when the site is built). */
export type Translation<T> = { [K in keyof T]: Message };
