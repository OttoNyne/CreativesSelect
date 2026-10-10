import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { apiUser, befriend, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const useLanguage = async (page: Page, code: "en" | "es" | "ar") => {
  await page.evaluate((c) => localStorage.setItem("cs-language", c), code);
  await page.reload();
};

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

const OUTBOX = process.env.MAIL_OUTBOX_DIR;

// The subjects and texts of the emails sent to this address so far.
async function mailsTo(address: string): Promise<{ subject: string; text: string }[]> {
  const names = (await readdir(OUTBOX!).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort();
  const found: { subject: string; text: string }[] = [];
  for (const name of names) {
    try {
      const mail = JSON.parse(await readFile(path.join(OUTBOX!, name), "utf8"));
      if (mail.to === address) found.push(mail);
    } catch {
      // being replaced as we look: it will be there next time
    }
  }
  return found;
}

test.describe("the site in other languages", () => {
  test("the footer's language box changes the language, and the choice stays", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.getByRole("combobox", { name: "Language" }).selectOption("es");
    await expect(page.getByRole("heading", { name: "Inicia sesión en CreativesSelect" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page).toHaveTitle(/Iniciar sesión/);

    await page.getByRole("combobox", { name: "Idioma" }).selectOption("ar");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول إلى CreativesSelect" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // the choice is remembered across pages and reloads
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "نبذة عن CreativesSelect" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await page.getByRole("combobox", { name: "اللغة" }).selectOption("en");
    await expect(page.getByRole("heading", { name: "About CreativesSelect" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("a visitor's browser language is used until they choose", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: "es-MX" });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Inicia sesión en CreativesSelect" })).toBeVisible();
    await context.close();
  });

  test("the page is mirrored for Arabic: the logo is on the right and the form fills from the right", async ({ page }) => {
    await page.goto("/login");
    await useLanguage(page, "ar");
    const width = page.viewportSize()!.width;
    const logo = await page.getByRole("link", { name: /CreativesSelect/ }).first().boundingBox();
    expect(logo!.x + logo!.width / 2).toBeGreaterThan(width / 2);
    await expectNoHorizontalOverflow(page);
    // an email is typed left to right, even on a page that reads right to left
    await expect(page.getByPlaceholder("البريد الإلكتروني")).toHaveCSS("direction", "rtl");
    await page.getByPlaceholder("البريد الإلكتروني").fill("zoe@example.com");
    await expect(page.getByPlaceholder("البريد الإلكتروني")).toHaveCSS("direction", "ltr");
    await expect(page.getByPlaceholder("البريد الإلكتروني")).toHaveCSS("text-align", "right");
  });

  test("what the server says arrives in the language of the page", async ({ page }) => {
    await page.goto("/login");
    await useLanguage(page, "es");
    await page.getByPlaceholder("Correo electrónico").fill("nobody@example.com");
    await page.getByPlaceholder("Contraseña").fill("not-the-password-1");
    await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await expect(page.getByText("Correo o contraseña no válidos")).toBeVisible();
    await useLanguage(page, "ar");
    await page.getByPlaceholder("البريد الإلكتروني").fill("nobody@example.com");
    await page.getByPlaceholder("كلمة المرور").fill("not-the-password-1");
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(page.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحين")).toBeVisible();
  });

  for (const language of ["es", "ar"] as const) {
    test(`signed in, every page fits the screen and can be read in ${language}`, async ({ page, browser, baseURL }) => {
      const me = newUser("poly");
      await signUpViaUi(page, me);
      const friend = await apiUser(browser, baseURL!, "mate");
      await befriend(page.request, friend.request, me.username);
      const post = await (await page.request.post("/api/posts", { data: { content: "A post to read" } })).json();
      await friend.request.post(`/api/posts/${post.post.id}/comments`, { data: { content: "A comment to read" } });
      await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "A message to read" } });
      await page.request.post("/api/tasks", { data: { title: "Find a painter", description: "For a mural", isPublic: true } });

      await useLanguage(page, language);
      const rtl = language === "ar";
      for (const path of ["/", "/friends", "/messages", `/messages/${friend.user.username}`, "/groups", "/events", "/live", "/search", "/help-wanted", "/bulletins", `/posts/${post.post.id}`, `/u/${me.username}`]) {
        await page.goto(path);
        await page.waitForLoadState("load");
        await page.waitForTimeout(400);
        await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
        await expectNoHorizontalOverflow(page);
        await expectReadable(page, `${path} in ${language}`);
      }

      // the owner's settings and the notification list
      await page.goto(`/u/${me.username}?edit=1`);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expectNoHorizontalOverflow(page);
      await expectReadable(page, `profile editing in ${language}`);
      await page.goto("/");
      await page.getByRole("button", { name: rtl ? "الإشعارات" : "Notificaciones" }).click();
      await expectReadable(page, `the notification list in ${language}`);
      await friend.context.close();
    });
  }

  test("dates and the time since something happened are in the language of the page", async ({ page, browser, baseURL }) => {
    const me = newUser("when");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "chat");
    await befriend(page.request, friend.request, me.username);
    await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Hello there" } });
    await useLanguage(page, "es");
    await page.getByRole("button", { name: "Notificaciones" }).click();
    await expect(page.getByText(/ahora mismo|hace \d+ min/).first()).toBeVisible();
    await expect(page.getByText(/te envió un mensaje/)).toBeVisible();
    await friend.context.close();
  });

  test("emails come in the language the person signed up in, and follow a change of language", async ({ page }) => {
    test.skip(!OUTBOX, "needs MAIL_OUTBOX_DIR (see e2e/README.md)");
    const me = newUser("carta");
    await page.goto("/register");
    await useLanguage(page, "es");
    await page.getByPlaceholder("Nombre para mostrar").fill(me.displayName);
    await page.getByPlaceholder("Nombre de usuario").fill(me.username);
    await page.getByPlaceholder("Correo electrónico").fill(me.email);
    await page.getByPlaceholder(/Contraseña/).fill(me.password);
    await page.getByRole("checkbox", { name: /Tengo al menos 13 años/ }).check();
    await page.getByRole("button", { name: "Registrarse", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect.poll(async () => (await mailsTo(me.email)).map((m) => m.subject)).toContain("Confirma tu correo de CreativesSelect");
    const spanish = (await mailsTo(me.email)).find((m) => /Confirma/.test(m.subject))!;
    expect(spanish.text).toContain(`Hola, ${me.displayName}`);
    expect(spanish.text).toMatch(/\/verify-email#token=[a-f0-9]+/);

    // switching the site to Arabic tells the account, so the next email is in Arabic
    await page.getByRole("combobox", { name: "Idioma" }).selectOption("ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect.poll(async () => (await page.request.get("/api/auth/me")).json().then((j) => j.user.language)).toBe("ar");
    await page.request.post("/api/auth/forgot-password", { data: { email: me.email } });
    await expect.poll(async () => (await mailsTo(me.email)).map((m) => m.subject)).toContain("إعادة تعيين كلمة مرور CreativesSelect");
  });
});
