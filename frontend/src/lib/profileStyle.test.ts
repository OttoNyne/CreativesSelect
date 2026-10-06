import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_OPTIONS, PRESETS, STYLE_KEYS, STYLE_OPTIONS, THEME_KEYS, WIDTH_CLASS, applyPreset, matchingPreset, styleAttributes, styleValue, themeToSave } from "./profileStyle";

describe("the choices", () => {
  it("are the same six lists the server checks, each with a usual choice that is one of them", () => {
    expect(STYLE_KEYS).toEqual(["cardStyle", "corners", "density", "headings", "avatarShape", "width"]);
    expect(STYLE_OPTIONS.cardStyle.choices.map((c) => c.value)).toEqual(["solid", "outline", "glass", "flat"]);
    expect(STYLE_OPTIONS.corners.choices.map((c) => c.value)).toEqual(["square", "rounded", "soft"]);
    expect(STYLE_OPTIONS.density.choices.map((c) => c.value)).toEqual(["compact", "comfortable", "roomy"]);
    expect(STYLE_OPTIONS.headings.choices.map((c) => c.value)).toEqual(["caps", "plain", "serif"]);
    expect(STYLE_OPTIONS.avatarShape.choices.map((c) => c.value)).toEqual(["circle", "rounded", "square"]);
    expect(STYLE_OPTIONS.width.choices.map((c) => c.value)).toEqual(["narrow", "standard", "wide"]);
    for (const key of STYLE_KEYS) expect(STYLE_OPTIONS[key].choices.map((c) => c.value)).toContain(STYLE_OPTIONS[key].default);
    expect(Object.keys(WIDTH_CLASS)).toEqual(["narrow", "standard", "wide"]);
  });

  it("offer ten fonts that are all on people's own devices, the first four being the ones always offered", () => {
    expect(FONT_OPTIONS).toHaveLength(10);
    expect(new Set(FONT_OPTIONS.map((f) => f.value)).size).toBe(10);
    expect(FONT_OPTIONS.slice(0, 4).map((f) => f.value)).toEqual(["system-ui, sans-serif", "Georgia, serif", "'Courier New', monospace", "'Trebuchet MS', sans-serif"]);
    for (const f of FONT_OPTIONS) expect(f.value).not.toMatch(/url\(|@import|https?:|\/\/|[;{}<>]/i);
  });

  it("are all handled by a rule in the stylesheet, so no choice does nothing", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const attribute: Record<string, string> = { cardStyle: "data-card", corners: "data-corners", density: "data-density", headings: "data-headings", avatarShape: "data-avatar" };
    for (const [key, attr] of Object.entries(attribute)) {
      const options = STYLE_OPTIONS[key as keyof typeof STYLE_OPTIONS];
      for (const choice of options.choices) {
        if (choice.value === options.default) continue; // the usual look needs no rule
        expect(css, `${attr}="${choice.value}"`).toContain(`[${attr}="${choice.value}"]`);
      }
    }
  });
});

describe("styleValue and styleAttributes", () => {
  it("give the usual choice for anything not set, or not one of the choices", () => {
    expect(styleValue(undefined, "cardStyle")).toBe("solid");
    expect(styleValue({}, "width")).toBe("standard");
    expect(styleValue({ cardStyle: "neon", width: "<script>" }, "cardStyle")).toBe("solid");
    expect(styleValue({ width: "wide" }, "width")).toBe("wide");
  });

  it("say what a page should carry, always one of the real choices", () => {
    expect(styleAttributes(undefined)).toEqual({ "data-card": "solid", "data-corners": "rounded", "data-density": "comfortable", "data-headings": "caps", "data-avatar": "circle" });
    expect(styleAttributes({ cardStyle: "glass", corners: "soft", density: "roomy", headings: "serif", avatarShape: "square" })).toEqual({ "data-card": "glass", "data-corners": "soft", "data-density": "roomy", "data-headings": "serif", "data-avatar": "square" });
    expect(styleAttributes({ cardStyle: 'x" onclick="y', corners: "bogus" })["data-card"]).toBe("solid"); // never what a profile merely says
  });
});

describe("themeToSave", () => {
  it("sends every setting, with null for the ones that are not set", () => {
    const saved = themeToSave({ bgColor: "#102030", cardStyle: "flat" });
    expect(Object.keys(saved)).toEqual([...THEME_KEYS]);
    expect(saved).toMatchObject({ bgColor: "#102030", cardStyle: "flat", textColor: null, accentColor: null, fontFamily: null, corners: null, density: null, headings: null, avatarShape: null, width: null });
  });

  it("treats an empty string as not set", () => {
    expect(themeToSave({ bgColor: "" }).bgColor).toBeNull();
  });
});

describe("presets", () => {
  it("are five, with the plain one first and each with a name, a label and a hint", () => {
    expect(PRESETS.map((p) => p.name)).toEqual(["default", "minimal", "classic", "gallery", "journal"]);
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.hint.length).toBeGreaterThan(10);
    }
    expect(PRESETS[0].settings).toEqual({});
  });

  it("only use choices that exist", () => {
    for (const p of PRESETS) for (const key of STYLE_KEYS) if (p.settings[key]) expect(STYLE_OPTIONS[key].choices.map((c) => c.value), `${p.name}.${key}`).toContain(p.settings[key]);
    for (const p of PRESETS) if (p.settings.fontFamily) expect(FONT_OPTIONS.map((f) => f.value)).toContain(p.settings.fontFamily);
  });

  it("replace the whole look but never the colours", () => {
    const mine = { bgColor: "#102030", textColor: "#eeeeee", accentColor: "#ff00aa", cardStyle: "glass", corners: "soft", width: "wide", fontFamily: "Georgia, serif" };
    const gallery = PRESETS.find((p) => p.name === "gallery")!;
    const minimal = PRESETS.find((p) => p.name === "minimal")!;
    const applied = applyPreset(mine, minimal);
    expect(applied).toMatchObject({ bgColor: "#102030", textColor: "#eeeeee", accentColor: "#ff00aa", cardStyle: "flat", density: "roomy", headings: "plain", width: "narrow", corners: "square" });
    expect(applied.fontFamily).toBeUndefined(); // the look it replaced had its own font
    expect(applyPreset(mine, gallery).corners).toBe("soft");
    const cleared = applyPreset(mine, PRESETS[0]);
    expect(STYLE_KEYS.every((k) => cleared[k] === undefined)).toBe(true);
    expect(cleared.bgColor).toBe("#102030");
    expect(mine.cardStyle).toBe("glass"); // the one it started from is left alone
  });

  it("are recognised when a theme matches one exactly, and not once it is changed", () => {
    for (const p of PRESETS) expect(matchingPreset(applyPreset({ bgColor: "#102030" }, p))?.name, p.name).toBe(p.name);
    expect(matchingPreset({})?.name).toBe("default");
    expect(matchingPreset({ cardStyle: "glass", corners: "soft", headings: "plain", width: "wide" })?.name).toBe("gallery");
    expect(matchingPreset({ cardStyle: "glass", corners: "soft", headings: "plain", width: "wide", density: "roomy" })).toBeNull();
    expect(matchingPreset({ fontFamily: "Georgia, serif" })).toBeNull();
  });
});

describe("the sections of a profile", () => {
  it("each carry the box and heading hooks the styles use", () => {
    const files = ["AboutMe", "MusicPlayer", "PortfolioGrid", "ProfileBlog", "ProfileComments", "ProfileVisitors", "TopFriendsList"];
    for (const name of files) {
      const source = readFileSync(resolve(process.cwd(), `src/components/profile/${name}.tsx`), "utf8");
      expect(source, `${name} box`).toMatch(/className="profile-card[ "]/);
      expect(source, `${name} heading`).toContain("profile-heading");
    }
    const page = readFileSync(resolve(process.cwd(), "src/pages/ProfilePage.tsx"), "utf8");
    expect(page).toMatch(/profile-avatar/);
    expect(page).toMatch(/profile-sections/);
  });
});
