import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const frame = (page: Page) => page.locator("[data-scheme]").first();
const firstBox = (page: Page) => page.locator(".profile-card").first();
const css = (page: Page, selector: string, property: string) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

/** Saves, and waits until the server has it (so what happens next can rely on it). */
async function save(page: Page) {
  const saved = page.waitForResponse((r) => r.url().includes("/api/profiles/me") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await saved).status()).toBe(200);
}

async function openEditor(page: Page, username: string) {
  await page.goto(`/u/${username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
}

test.describe("profile styles", () => {
  test("an owner starts from the Gallery look, sees it at once, saves it, and a visitor sees the same", async ({ page, browser, baseURL }) => {
    const me = newUser("styled");
    await signUpViaUi(page, me);
    await openEditor(page, me.username);

    // nothing is chosen yet: the usual style
    await expect(frame(page)).toHaveAttribute("data-card", "solid");
    expect(await css(page, ".profile-card", "border-top-left-radius")).toBe("12px");

    await page.getByRole("button", { name: "Gallery" }).click();
    await expect(page.getByRole("button", { name: "Gallery" })).toHaveAttribute("aria-pressed", "true");
    // the page changes before anything is saved
    await expect(frame(page)).toHaveAttribute("data-card", "glass");
    expect(await css(page, ".profile-card", "border-top-left-radius")).toBe("28px");
    expect(await css(page, ".profile-card", "backdrop-filter")).toContain("blur");
    expect(await css(page, ".max-w-5xl", "max-width")).toBe("1024px");

    await save(page);
    await page.getByRole("button", { name: "Done editing" }).click();

    // a visitor with no account sees what the owner chose
    const visitor = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const vpage = await visitor.newPage();
    await vpage.goto(`/u/${me.username}`);
    await expect(frame(vpage)).toHaveAttribute("data-card", "glass", { timeout: 20_000 });
    await expect(frame(vpage)).toHaveAttribute("data-corners", "soft", { timeout: 20_000 });
    await expect(frame(vpage)).toHaveAttribute("data-headings", "plain", { timeout: 20_000 });
    expect(await css(vpage, ".profile-card", "border-top-left-radius")).toBe("28px");
    expect(await css(vpage, ".max-w-5xl", "max-width")).toBe("1024px");
    await visitor.close();

    // and it is still there after a reload
    await page.reload();
    await expect(frame(page)).toHaveAttribute("data-card", "glass", { timeout: 20_000 });
  });

  test("each look changes how the boxes, headings and picture are drawn, and a choice can be tweaked or reset", async ({ page }) => {
    const me = newUser("looks");
    await signUpViaUi(page, me);
    await openEditor(page, me.username);

    await page.getByRole("button", { name: "Minimal" }).click();
    await expect(frame(page)).toHaveAttribute("data-card", "flat");
    expect(await css(page, ".profile-card", "border-top-color")).toBe("rgba(0, 0, 0, 0)"); // no box
    expect(await css(page, ".profile-card", "border-top-left-radius")).toBe("0px");
    expect(await css(page, ".max-w-2xl", "max-width")).toBe("672px");

    await page.getByRole("button", { name: "Classic" }).click();
    expect(await css(page, ".profile-card", "border-top-width")).toBe("2px");
    expect(await css(page, ".profile-card", "padding-top")).toBe("12px"); // tight
    expect(await css(page, ".profile-avatar", "border-top-left-radius")).toBe("0px"); // a square picture
    expect(await css(page, ".profile-card", "font-family")).toContain("Verdana");

    await page.getByRole("button", { name: "Journal" }).click();
    expect(await css(page, ".profile-heading", "text-transform")).toBe("none");
    expect(await css(page, ".profile-heading", "font-family")).toContain("Georgia");

    // tweak one thing: it is no longer exactly any look
    await page.getByLabel("Corners").selectOption("soft");
    for (const name of ["Default", "Minimal", "Classic", "Gallery", "Journal"]) await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "false");
    expect(await css(page, ".profile-card", "border-top-left-radius")).toBe("28px");

    await page.getByRole("button", { name: "Default" }).click();
    await expect(frame(page)).toHaveAttribute("data-card", "solid");
    expect(await css(page, ".profile-card", "border-top-left-radius")).toBe("12px");
    expect(await css(page, ".max-w-3xl", "max-width")).toBe("768px");
  });

  test("a style that was saved and then reset really is gone", async ({ page }) => {
    const me = newUser("reset");
    await signUpViaUi(page, me);
    await openEditor(page, me.username);
    await page.getByRole("button", { name: "Gallery" }).click();
    await save(page);
    await page.getByRole("button", { name: "Done editing" }).click();
    await expect(frame(page)).toHaveAttribute("data-card", "glass");

    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: "Default" }).click();
    await save(page);
    await page.getByRole("button", { name: "Done editing" }).click();
    await page.reload();
    await expect(frame(page)).toHaveAttribute("data-card", "solid", { timeout: 20_000 });
    const saved = (await (await page.request.get(`/api/profiles/${me.username}`)).json()).user.theme;
    expect(saved.cardStyle ?? null).toBeNull();
    expect(saved.width ?? null).toBeNull();
  });

  test("a wide, roomy page still fits a phone, and nothing sticks out", async ({ page }) => {
    const me = newUser("fits");
    await signUpViaUi(page, me);
    expect((await page.request.patch("/api/profiles/me", { data: { theme: { width: "wide", density: "roomy", cardStyle: "glass", corners: "soft", headings: "serif" } } })).status()).toBe(200);
    await page.goto(`/u/${me.username}`);
    await expect(firstBox(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("only the listed choices, colours and fonts are accepted, and a bad one changes nothing", async ({ page }) => {
    const me = newUser("strict");
    await signUpViaUi(page, me);
    const patch = (theme: unknown) => page.request.patch("/api/profiles/me", { data: { theme, bio: "Changed" } });
    expect((await patch({ cardStyle: "glass" })).status()).toBe(200);
    for (const bad of [{ cardStyle: "neon" }, { customCss: "body{display:none}" }, { bgColor: "red" }, { bgColor: "#12345" }, { fontFamily: "Arial" }, { fontFamily: "x;background:url(//evil)" }, { width: "full" }]) {
      const res = await patch(bad);
      expect(res.status(), JSON.stringify(bad)).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }
    expect((await patch({ bgColor: "#102030", fontFamily: "Georgia, serif", corners: "square" })).status()).toBe(200);
    const mine = (await (await page.request.get(`/api/profiles/${me.username}`)).json()).user;
    expect(mine.theme).toMatchObject({ cardStyle: "glass", bgColor: "#102030", corners: "square" });
  });

  test("the feed keeps its own look, whatever style the profile has", async ({ page }) => {
    const me = newUser("feedlook");
    await signUpViaUi(page, me);
    expect((await page.request.patch("/api/profiles/me", { data: { theme: { bgColor: "#224488", cardStyle: "glass", corners: "square", width: "wide" } } })).status()).toBe(200);
    await page.goto("/");
    await expect(frame(page)).toBeVisible();
    await expect(frame(page)).not.toHaveAttribute("data-card", /.*/); // only the background comes across
    await expect(page.locator(".profile-card")).toHaveCount(0);
  });
});
