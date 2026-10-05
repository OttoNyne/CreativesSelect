import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// A 1×1 picture, enough to be a wallpaper.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** The element a page is drawn on (the one that carries the person's background), or null if the page has none of its own. */
const backdrop = (page: Page) => page.locator("[data-scheme]").first();
const colourOf = (page: Page) => backdrop(page).evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("the feed is on the same background as the profile", () => {
  test("a colour chosen for the profile is the feed's colour too, and changes with it", async ({ page }) => {
    const me = newUser("tinted");
    await signUpViaUi(page, me);
    await page.request.post("/api/posts", { data: { content: `A post on a tinted feed ${me.username}` } });

    // nothing chosen: the feed is the usual page, with no background of its own
    await page.goto("/");
    await expect(page.getByText(/A post on a tinted feed/)).toBeVisible();
    await expect(page.locator("[data-scheme]")).toHaveCount(0);

    expect((await page.request.patch("/api/profiles/me", { data: { theme: { bgColor: "#224488" } } })).status()).toBe(200);
    await page.goto("/");
    await expect(page.getByText(/A post on a tinted feed/)).toBeVisible();
    await expect(backdrop(page)).toBeVisible();
    const feed = await colourOf(page);
    expect(feed).toBe("rgb(34, 68, 136)");
    // the very same colour as the profile page
    await page.goto(`/u/${me.username}`);
    await expect(page.getByRole("heading", { name: me.displayName })).toBeVisible();
    expect(await colourOf(page)).toBe(feed);

    // a new colour on the profile is the feed's next time
    expect((await page.request.patch("/api/profiles/me", { data: { theme: { bgColor: "#884422" } } })).status()).toBe(200);
    await page.goto("/");
    await expect(page.getByText(/A post on a tinted feed/)).toBeVisible();
    expect(await colourOf(page)).toBe("rgb(136, 68, 34)");
  });

  test("a wallpaper chosen for the profile is behind the feed", async ({ page }) => {
    const me = newUser("papered");
    await signUpViaUi(page, me);
    expect((await page.request.patch("/api/profiles/me", { data: { wallpaperUrl: PIXEL, wallpaperType: "image" } })).status()).toBe(200);
    await page.goto("/");
    await expect(backdrop(page)).toHaveAttribute("data-wallpaper", "true");
    expect(await backdrop(page).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("data:image/png");
    // the feed still works on it
    await page.getByPlaceholder(/Share what you're working on/).fill("Posting on a wallpaper");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("Posting on a wallpaper")).toBeVisible();
  });

  test("the feed keeps its own font and the rest of the site is unchanged", async ({ page }) => {
    const me = newUser("fonty");
    await signUpViaUi(page, me);
    const plain = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect((await page.request.patch("/api/profiles/me", { data: { theme: { bgColor: "#224488", fontFamily: "Georgia, serif" } } })).status()).toBe(200);
    await page.goto("/");
    await expect(backdrop(page)).toBeVisible();
    expect(await backdrop(page).evaluate((el) => getComputedStyle(el).fontFamily)).toBe(plain);
    // the top bar and other pages keep the site's own look
    await page.goto("/friends");
    await expect(page.locator("[data-scheme]")).toHaveCount(0);
  });
});
