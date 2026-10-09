import { describe, expect, it } from "vitest";
import { activeMention, insertMention, splitMentions } from "./mentions";

describe("activeMention", () => {
  it("finds the name being typed just before the caret", () => {
    expect(activeMention("hello @sa", 9)).toEqual({ start: 6, query: "sa" });
    expect(activeMention("@sa", 3)).toEqual({ start: 0, query: "sa" });
    expect(activeMention("hello @", 7)).toEqual({ start: 6, query: "" });
    expect(activeMention("line one\n@lee", 13)).toEqual({ start: 9, query: "lee" });
  });
  it("is only the name at the caret, not one further along", () => {
    expect(activeMention("hello @sam and more", 9)).toEqual({ start: 6, query: "sa" });
    expect(activeMention("hello @sam and more", 15)).toBeNull();
  });
  it("is nothing inside an email address or a word, after a space that ended the name, or without an @", () => {
    for (const [text, caret] of [["mail sam@exa", 12], ["hi@bob", 6], ["@@bo", 4], ["@sam ", 5], ["no at sign", 10], ["", 0]] as const) expect(activeMention(text, caret), text).toBeNull();
  });
});

describe("insertMention", () => {
  it("puts the chosen name where the typed part was, with a space after, and the caret after that", () => {
    expect(insertMention("hello @sa", 9, 6, "samuel")).toEqual({ text: "hello @samuel ", caret: 14 });
  });
  it("keeps what comes after, without doubling a space that is already there", () => {
    expect(insertMention("hi @sa there", 6, 3, "samuel")).toEqual({ text: "hi @samuel there", caret: 11 });
    expect(insertMention("hi @sa\nthere", 6, 3, "samuel")).toEqual({ text: "hi @samuel\nthere", caret: 10 });
  });
});

describe("splitMentions", () => {
  it("cuts text into plain text and names, losing nothing", () => {
    expect(splitMentions("thanks @sam_1, and @Lee!")).toEqual([
      { kind: "text", text: "thanks " },
      { kind: "mention", username: "sam_1", text: "@sam_1" },
      { kind: "text", text: ", and " },
      { kind: "mention", username: "Lee", text: "@Lee" },
      { kind: "text", text: "!" },
    ]);
    const original = "a @bob b @@no c@d.com @ab";
    expect(splitMentions(original).map((p) => p.text).join("")).toBe(original);
  });
  it("leaves email addresses, glued names, too-short names and a bare @ alone", () => {
    for (const text of ["write to sam@example.com", "hi@bob", "@@bob", "@ab", "a @ b", "no names"]) expect(splitMentions(text).every((p) => p.kind === "text"), text).toBe(true);
  });
  it("is the same rule as the server's: 3 to 30 letters, numbers and underscores", () => {
    expect(splitMentions(`@${"a".repeat(30)}`)[0]).toMatchObject({ kind: "mention" });
    expect(splitMentions(`@${"a".repeat(31)}`).every((p) => p.kind === "text")).toBe(true);
  });
  it("is empty for empty text", () => {
    expect(splitMentions("")).toEqual([]);
  });
});

describe("splitMentions: hashtags", () => {
  it("finds #hashtags beside @names, lower-cased for the address and keeping the text as written", () => {
    expect(splitMentions("Thanks @sam for the #Ceramics tips")).toEqual([
      { kind: "text", text: "Thanks " },
      { kind: "mention", username: "sam", text: "@sam" },
      { kind: "text", text: " for the " },
      { kind: "hashtag", tag: "ceramics", text: "#Ceramics" },
      { kind: "text", text: " tips" },
    ]);
  });
  it("works for tags in Spanish and Arabic", () => {
    expect(splitMentions("Mi #cerámica y #الخزف").filter((p) => p.kind === "hashtag").map((p) => (p as { tag: string }).tag)).toEqual(["cerámica", "الخزف"]);
  });
  it("leaves numbers, entities, glued words, a bare # and too-short tags alone, and loses nothing", () => {
    for (const text of ["issue #12", "&#39;quoted&#39;", "abc#def", "##double", "#", "# space", "#a"]) expect(splitMentions(text).every((p) => p.kind === "text"), text).toBe(true);
    const original = "a #tag b @bob c #x d #ok_2 e";
    expect(splitMentions(original).map((p) => p.text).join("")).toBe(original);
  });
});
