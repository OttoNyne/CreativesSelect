import { describe, expect, it } from "vitest";
import { MAX_LABEL, safeUrl, splitLinks } from "./links";

const links = (text: string) => splitLinks(text).filter((p) => p.kind === "link");
const rebuilt = (text: string) => splitLinks(text).map((p) => (p.kind === "text" ? p.text : p.url)).join("");

describe("splitLinks", () => {
  it("leaves text without an address alone", () => {
    expect(splitLinks("Just words, nothing to click.")).toEqual([{ kind: "text", text: "Just words, nothing to click." }]);
    expect(splitLinks("")).toEqual([]);
  });

  it("finds an address in a sentence, keeping the words around it", () => {
    expect(splitLinks("See https://example.com/work for more")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", url: "https://example.com/work", label: "example.com/work" },
      { kind: "text", text: " for more" },
    ]);
  });

  it("finds several, in order, with http and https", () => {
    const found = links("a http://one.example.com b https://two.example.org/x?y=1 c");
    expect(found.map((l) => l.kind === "link" && l.url)).toEqual(["http://one.example.com/", "https://two.example.org/x?y=1"]);
  });

  it("leaves the punctuation around an address out of it", () => {
    for (const [text, url] of [
      ["Look: https://example.com/a.", "https://example.com/a"],
      ["(see https://example.com/a)", "https://example.com/a"],
      ["Wow https://example.com/a!!!", "https://example.com/a"],
      ["yes, https://example.com/a, and", "https://example.com/a"],
      ["is it https://example.com/a?", "https://example.com/a"],
    ] as const) {
      const [link] = links(text);
      expect(link && link.kind === "link" && link.url, text).toBe(url);
      expect(rebuilt(text).replace(/\/$/, "").length).toBeGreaterThan(0);
    }
  });

  it("keeps a bracket that belongs to the address", () => {
    const [link] = links("https://en.example.org/wiki/Thing_(art) is good");
    expect(link.kind === "link" && link.url).toBe("https://en.example.org/wiki/Thing_(art)");
    const [other] = links("(https://en.example.org/wiki/Thing_(art))");
    expect(other.kind === "link" && other.url).toBe("https://en.example.org/wiki/Thing_(art)");
  });

  it("loses no text: the pieces put back together are the whole comment", () => {
    for (const text of ["a https://x.example.com/b c", "(https://x.example.com/a), https://y.example.com.", "no link", "https://x.example.com", "x https://x.example.com/a)\nnext line"]) {
      const whole = splitLinks(text).map((p) => (p.kind === "text" ? p.text : p.label)).join("");
      // labels are shortened addresses, so compare with the scheme and a trailing slash taken off
      expect(whole.replace(/https?:\/\//g, "").replace(/\/(?=\W|$)/g, "")).toBe(text.replace(/https?:\/\//g, "").replace(/\/(?=\W|$)/g, ""));
    }
  });

  it("shows a long address shortened, with the start of it", () => {
    const long = "https://example.com/" + "a".repeat(100);
    const [link] = links(long);
    expect(link.kind === "link" && link.label.length).toBe(MAX_LABEL);
    expect(link.kind === "link" && link.label.endsWith("…")).toBe(true);
    expect(link.kind === "link" && link.url).toBe(long);
  });

  it("doesn't link what isn't a web address: other schemes, no host, addresses with a name and password", () => {
    for (const text of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com/x", "https://localhost/x", "https://user:pass@example.com/", "https://paypal.com@evil.example.com/login", "www.example.com", "example.com/x"]) {
      expect(links(text), text).toEqual([]);
    }
    expect(splitLinks("https://paypal.com@evil.example.com/login")).toEqual([{ kind: "text", text: "https://paypal.com@evil.example.com/login" }]);
  });

  it("treats markup as text, and stops an address at an angle bracket or a quote", () => {
    expect(splitLinks("<b>hi</b>")).toEqual([{ kind: "text", text: "<b>hi</b>" }]);
    const [link] = links('see "https://example.com/a" now <https://example.org/b>');
    expect(link.kind === "link" && link.url).toBe("https://example.com/a");
    expect(links('<a href="https://example.com/a">x</a>').map((l) => l.kind === "link" && l.url)).toEqual(["https://example.com/a"]);
  });
});

describe("safeUrl", () => {
  it("accepts a plain web address and tidies it", () => {
    expect(safeUrl("https://Example.com")).toBe("https://example.com/");
  });
  it("refuses anything else", () => {
    for (const bad of ["", "nope", "javascript:alert(1)", "https://", "https://nodot", "https://a:b@example.com", "mailto:a@b.com"]) expect(safeUrl(bad), bad).toBeNull();
  });
});
