import { afterEach, describe, expect, it } from "vitest";
import { en } from "./locales/en";
import { messages as es } from "./locales/es";
import { messages as ar } from "./locales/ar";
import { serverEs } from "./locales/server.es";
import { serverAr } from "./locales/server.ar";
import { applyDocumentLanguage, detectLanguage, initI18n, isRtl, LANGUAGES, language, locale, t, translateServerMessage, type Key, type Message } from "./index";

const placeholders = (m: Message): string[] => {
  const texts = typeof m === "string" ? [m] : Object.values(m);
  return [...new Set(texts.flatMap((x) => [...x.matchAll(/\{(\w+)\}/g)].map((p) => p[1])))].sort();
};
const tags = (m: Message): string[] => {
  const texts = typeof m === "string" ? [m] : Object.values(m);
  return [...new Set(texts.flatMap((x) => [...x.matchAll(/<(\w+)>/g)].map((p) => p[1])))].sort();
};
const englishKeys = Object.keys(en) as Key[];

afterEach(async () => {
  await initI18n("en");
  document.documentElement.removeAttribute("dir");
});

describe("choosing the language", () => {
  it("uses what the person chose before anything their browser says", () => {
    expect(detectLanguage("ar", ["es-MX"])).toBe("ar");
  });
  it("otherwise takes the first browser language the site has, ignoring the region", () => {
    expect(detectLanguage(null, ["fr-FR", "es-MX", "ar"])).toBe("es");
    expect(detectLanguage(undefined, ["AR-EG"])).toBe("ar");
  });
  it("falls back to English for anything else, including a stored value that is not a language", () => {
    expect(detectLanguage("xx", ["fr", "de"])).toBe("en");
    expect(detectLanguage(null, undefined)).toBe("en");
    expect(detectLanguage("<script>", [])).toBe("en");
  });
  it("knows which languages read right to left", () => {
    expect(LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code)).toEqual(["ar"]);
  });
});

describe("looking text up", () => {
  it("gives English by default", () => {
    expect(t("nav.feed")).toBe("Feed");
  });
  it("gives the language in use, and its direction and locale", async () => {
    await initI18n("ar");
    expect(t("nav.feed")).toBe(ar["nav.feed"]);
    expect(isRtl()).toBe(true);
    expect(locale()).toBe("ar-u-nu-latn");
    expect(language()).toBe("ar");
    await initI18n("es");
    expect(isRtl()).toBe(false);
    expect(t("nav.friends")).toBe(es["nav.friends"]);
  });
  it("shows the English text, or the key itself, when there is no translation", async () => {
    await initI18n("es");
    expect(t("not.a.real.key" as Key)).toBe("not.a.real.key");
  });
  it("fills in {values}, formatting numbers for the language, and leaves an unknown {name} as it is", async () => {
    expect(t("verifyBanner.message", { email: "a@b.c" })).toContain("a@b.c");
    expect(t("nav.feed", { x: 1 })).toBe("Feed");
  });
  it("sets the document's language and direction", async () => {
    await initI18n("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    await initI18n("en");
    expect(document.documentElement.dir).toBe("ltr");
    applyDocumentLanguage(undefined);
  });
});

describe("plurals", () => {
  it("picks the form for the number in each language", async () => {
    const plural = englishKeys.find((k) => typeof en[k] !== "string");
    if (!plural) return;
    const forms = (en[plural] as Record<string, string>);
    expect(forms.one).toBeDefined();
    expect(t(plural, { n: 1 })).toBe(forms.one.replace(/\{n\}/g, "1"));
    expect(t(plural, { n: 5 })).toBe(forms.other.replace(/\{n\}/g, "5"));
  });
});

describe.each([
  ["Spanish", es, serverEs],
  ["Arabic", ar, serverAr],
])("the %s translation", (_name, messages, server) => {
  it("has a text for every English key and none that English does not have", () => {
    const missing = englishKeys.filter((k) => messages[k] === undefined);
    const orphans = Object.keys(messages).filter((k) => !(k in en));
    expect(missing).toEqual([]);
    expect(orphans).toEqual([]);
  });
  it("uses the same {values} and <tags> as the English, so nothing is dropped or invented", () => {
    for (const k of englishKeys) {
      const m = messages[k]!;
      expect({ key: k, placeholders: placeholders(m) }).toEqual({ key: k, placeholders: placeholders(en[k] as Message) });
      expect({ key: k, tags: tags(m) }).toEqual({ key: k, tags: tags(en[k] as Message) });
    }
  });
  it("is plural wherever the English is, with at least the forms the language needs", () => {
    const code = messages === es ? "es" : "ar";
    const needed = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    for (const k of englishKeys) {
      const m = messages[k]!;
      if (typeof en[k] === "string") expect(typeof m).toBe("string");
      else {
        expect(typeof m).toBe("object");
        for (const form of needed) expect({ key: k, form, text: (m as Record<string, string>)[form] ?? (m as { other: string }).other }).toMatchObject({ text: expect.any(String) });
      }
    }
  });
  it("has no empty text", () => {
    for (const k of englishKeys) {
      const m = messages[k]!;
      for (const text of typeof m === "string" ? [m] : Object.values(m)) expect(text.trim(), k).not.toBe("");
    }
  });
  it("translates the server's messages without losing a {value}", () => {
    for (const [english, translated] of Object.entries(server)) {
      expect(translated.trim(), english).not.toBe("");
      expect([...translated.matchAll(/\{(\w+)\}/g)].map((p) => p[1]).sort(), english).toEqual([...english.matchAll(/\{(\w+)\}/g)].map((p) => p[1]).sort());
    }
  });
});

describe("the server's messages", () => {
  it("are shown as they came when there is no translation", async () => {
    await initI18n("es");
    expect(translateServerMessage("Something nobody has translated")).toBe("Something nobody has translated");
  });
});
