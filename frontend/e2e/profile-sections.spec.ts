import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const TITLES = ["About me", "Top Friends", "Music", "Portfolio", "Blog", "Testimonials"];
/** The sections on the page, top to bottom. */
const sectionsOf = async (page: Page) => (await page.getByRole("heading", { level: 2 }).allTextContents()).map((t) => t.trim()).filter((t) => TITLES.includes(t));

test.describe("arranging a profile's sections", () => {
  test("the owner moves and hides sections, and visitors see exactly that", async ({ page, browser, baseURL }) => {
    const me = newUser("arranger");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await expect.poll(() => sectionsOf(page)).toEqual(TITLES);

    await page.getByRole("button", { name: "Edit profile" }).click();
    // bring the blog to the top (four moves up), then hide the music
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Move Blog up" }).click();
    await expect.poll(() => sectionsOf(page)).toEqual(["Blog", "About me", "Top Friends", "Music", "Portfolio", "Testimonials"]);
    await page.getByRole("button", { name: "Hide Music" }).click();
    await expect(page.getByRole("group", { name: "Music section" })).toContainText("Hidden from visitors");
    await expect(page.getByRole("button", { name: "Move Blog up" })).toBeDisabled(); // already first
    await expect(page.getByRole("button", { name: "Show Music" })).toBeVisible();

    // outside editing the owner sees what visitors see
    await page.getByRole("button", { name: "Done editing" }).click();
    await expect.poll(() => sectionsOf(page)).toEqual(["Blog", "About me", "Top Friends", "Portfolio", "Testimonials"]);

    // it is saved: a reload shows the same
    await page.reload();
    await expect.poll(() => sectionsOf(page)).toEqual(["Blog", "About me", "Top Friends", "Portfolio", "Testimonials"]);

    // a visitor sees the same order, without the hidden section, and no controls
    const visitor = await secondBrowserUser(browser, baseURL!, "visitor");
    await visitor.page.goto(`/u/${me.username}`);
    await expect.poll(() => sectionsOf(visitor.page)).toEqual(["Top Friends", "Portfolio", "Testimonials"]); // an empty blog and an empty About me aren't shown to a visitor
    await expect(visitor.page.getByRole("button", { name: /^Move / })).toHaveCount(0);
    await expect(visitor.page.getByRole("button", { name: /^(Hide|Show) / })).toHaveCount(0);
    await visitor.context.close();

    // show the music again
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: "Show Music" }).click();
    await page.getByRole("button", { name: "Done editing" }).click();
    await expect.poll(() => sectionsOf(page)).toEqual(["Blog", "About me", "Top Friends", "Music", "Portfolio", "Testimonials"]);
  });

  test("the sections can be arranged on a phone-sized screen without the page growing sideways", async ({ page }) => {
    const me = newUser("narrow");
    await signUpViaUi(page, me);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: "Move Music up" }).click();
    await expect.poll(() => sectionsOf(page)).toEqual(["About me", "Music", "Top Friends", "Portfolio", "Blog", "Testimonials"]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("a bad arrangement sent straight to the API is refused", async ({ page }) => {
    await signUpViaUi(page, newUser("sneaky"));
    expect((await page.request.patch("/api/profiles/me", { data: { sectionOrder: ["blog"] } })).status()).toBe(400);
    expect((await page.request.patch("/api/profiles/me", { data: { hiddenSections: ["nope"] } })).status()).toBe(400);
  });
});
