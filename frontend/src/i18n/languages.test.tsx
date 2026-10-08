import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import fs from "node:fs";
import path from "node:path";
import { initI18n, setLanguage, STORAGE_KEY, translateServerMessage, t } from "./index";
import { agoText, daysLeft, untilText, formatDay } from "../lib/when";
import { api, ApiError } from "../api/client";
import { LanguageSwitcher } from "../components/common/LanguageSwitcher";
import { PersonCard } from "../components/search/PersonCard";
import { ReactionBar } from "../components/common/ReactionBar";
import { emptyReactions } from "../lib/reactions";
import { notificationTarget } from "../lib/notificationTarget";
import { titleForPath } from "../lib/usePageTitle";
import type { Notification, User } from "../types";

afterEach(async () => {
  await initI18n("en");
  localStorage.clear();
  vi.restoreAllMocks();
});

const MIN = 60_000;
const NOW = new Date("2026-10-10T12:00:00Z");
const ago = (ms: number) => agoText(new Date(NOW.getTime() - ms), NOW);

describe("words for time, in each language's own plural forms", () => {
  it("Spanish", async () => {
    await initI18n("es");
    expect(ago(0)).toBe("ahora mismo");
    expect(ago(MIN)).toBe("hace 1 minuto");
    expect(ago(12 * MIN)).toBe("hace 12 minutos");
    expect(ago(120 * MIN)).toBe("hace 2 horas");
    expect(untilText(new Date(NOW.getTime() + 3 * 24 * 60 * MIN), NOW)).toBe("en 3 días");
    expect(daysLeft(new Date(NOW.getTime() + 12 * 60 * MIN), NOW)).toBe("queda menos de un día");
  });
  it("Arabic, which has one, two, a few, many and other", async () => {
    await initI18n("ar");
    expect(ago(0)).toBe("الآن");
    expect(ago(MIN)).toBe("قبل دقيقة");
    expect(ago(2 * MIN)).toBe("قبل دقيقتين");
    expect(ago(5 * MIN)).toBe("قبل 5 دقائق");
    expect(ago(11 * MIN)).toBe("قبل 11 دقيقة");
    expect(ago(3 * 24 * 60 * MIN)).toBe("قبل 3 أيام");
    expect(daysLeft(new Date(NOW.getTime() + 2 * 24 * 60 * MIN), NOW)).toBe("تبقّى يومان");
  });
  it("dates are written in the language of the page, with Western digits for Arabic", async () => {
    await initI18n("es");
    expect(formatDay("2026-10-04T12:00:00Z")).toMatch(/octubre/i);
    await initI18n("ar");
    expect(formatDay("2026-10-04T12:00:00Z")).toMatch(/2026/);
    expect(formatDay("2026-10-04T12:00:00Z")).not.toMatch(/[٠-٩]/);
  });
});

describe("what the server says", () => {
  it("is shown in the language of the page, exact messages and ones with a number in them", async () => {
    await initI18n("es");
    expect(translateServerMessage("Incorrect password")).toBe("Contraseña incorrecta");
    expect(translateServerMessage("Titles can be up to 80 characters")).toBe("Los títulos pueden tener hasta 80 caracteres");
    expect(translateServerMessage("Messages can be up to 2000 characters")).toBe("Los mensajes pueden tener hasta 2000 caracteres");
    expect(translateServerMessage("Your portfolio is full (60 pieces) — remove one to add another")).toBe("Tu portafolio está lleno (60 obras): quita una para añadir otra");
    await initI18n("ar");
    expect(translateServerMessage("Incorrect password")).toBe("كلمة المرور غير صحيحة");
    expect(translateServerMessage("Maximum of 20 tracks reached")).toBe("تم بلوغ الحد الأقصى وهو 20 مقطعًا");
  });
  it("is left as it came when there is no translation, and in English never changes", async () => {
    await initI18n("ar");
    expect(translateServerMessage("Something brand new from the server")).toBe("Something brand new from the server");
    await initI18n("en");
    expect(translateServerMessage("Incorrect password")).toBe("Incorrect password");
  });
  it("arrives translated in the error a page receives", async () => {
    await initI18n("es");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401, headers: { "Content-Type": "application/json" } }));
    const err = await api.post("/auth/login", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Correo o contraseña no válidos");
  });
});

describe("switching language", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload: vi.fn() } });
  });
  it("remembers the choice and reloads, so everything on the page changes together", () => {
    setLanguage("ar");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("ar");
    expect(window.location.reload).toHaveBeenCalled();
  });
  it("ignores something that is not a language", () => {
    setLanguage("klingon" as never);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.location.reload).not.toHaveBeenCalled();
  });
  it("names each language in itself", async () => {
    render(<LanguageSwitcher />);
    const options = within(screen.getByRole("combobox")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["English", "Español", "العربية"]);
  });
});

describe("screens in another language", () => {
  const person = { id: "u1", username: "zoe", displayName: "Zoe", tags: ["lo-fi"] } as unknown as User;
  it("a person card, with plurals and labels, in Spanish", async () => {
    await initI18n("es");
    render(
      <MemoryRouter>
        <PersonCard user={person} mutualCount={3} isFriend onTag={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Tu amigo · 3 amigos en común")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver a todos los etiquetados con lo-fi" })).toBeInTheDocument();
  });
  it("a person card, in Arabic", async () => {
    await initI18n("ar");
    render(
      <MemoryRouter>
        <PersonCard user={person} mutualCount={2} onTag={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("صديقان مشتركان")).toBeInTheDocument();
  });
  it("the reactions are named in the language of the page", async () => {
    await initI18n("es");
    render(<ReactionBar summary={emptyReactions()} canReact onReact={async () => {}} />);
    expect(screen.getByRole("group", { name: "Reacciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir una reacción" })).toBeInTheDocument();
  });
  it("where a notification leads is named in the language of the page", async () => {
    await initI18n("es");
    const n = { id: "n1", type: "comment", payload: { postId: "p1" }, isRead: false, createdAt: "", actor: null } as unknown as Notification;
    expect(notificationTarget(n)?.label).toBe("Ver publicación");
  });
  it("the title of the browser tab is in the language of the page", async () => {
    await initI18n("ar");
    expect(titleForPath("/friends")).toBe("الأصدقاء · CreativesSelect");
    await initI18n("es");
    expect(titleForPath("/login")).toBe("Iniciar sesión · CreativesSelect");
    expect(t("nav.feed")).toBe("Inicio");
  });
});

// Words that point left or right in a style turn the wrong way when the page is mirrored for Arabic. The start/end forms turn with it.
describe("a page that can be mirrored", () => {
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (name !== "i18n") sources(full, out);
      } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
    }
    return out;
  }
  const PHYSICAL = /(^|[\s"'`:!])(-?(ml|mr|pl|pr)-\d|-?(ml|mr)-auto|text-(left|right)\b|float-(left|right)|border-[lr](?=$|[\s"'`-])|rounded-[lr](?=$|[\s"'`-])|rounded-(tl|tr|bl|br)(?=$|[\s"'`-])|-?(left|right)-(?!1\/2))/;
  it("uses start/end (not left/right) for margins, padding, borders, corners, text alignment and positions", () => {
    const offenders: string[] = [];
    for (const file of sources(path.resolve(__dirname, ".."))) {
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/className|class=|`/.test(line) && PHYSICAL.test(line)) offenders.push(`${path.relative(path.resolve(__dirname, ".."), file)}:${i + 1}  ${line.trim().slice(0, 110)}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("when a language's file can't be loaded", () => {
  it("shows the page in English, left to right, instead of not showing it", async () => {
    vi.resetModules();
    vi.doMock("./locales/ar", () => {
      throw new Error("offline");
    });
    const fresh = await import("./index");
    await fresh.initI18n("ar");
    expect(fresh.language()).toBe("en");
    expect(fresh.t("nav.feed")).toBe("Feed");
    expect(document.documentElement.dir).toBe("ltr");
    vi.doUnmock("./locales/ar");
    vi.resetModules();
  });
});
