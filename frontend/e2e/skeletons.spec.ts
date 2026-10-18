import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

/** Make the feed take a moment to answer, so what shows while it waits can be looked at. */
async function slowFeed(page: Page, ms = 1500) {
  await page.route("**/api/posts/feed*", async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}
const animationOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

test.describe("loading shapes and fade-ins", () => {
  // the rest of the browser tests run with motion off (playwright.config.ts); here it is on, to see it for real
  test.describe("with motion", () => {
    test.use({ reducedMotion: "no-preference" });

    test("the feed shows the shapes of posts that shimmer while it loads, then the posts fade in and the shapes are gone", async ({ page }) => {
      await signUpViaUi(page, newUser("shimmer"));
      const words = unique("A post that will fade in");
      expect((await page.request.post("/api/posts", { data: { content: words } })).status()).toBe(201);

      await slowFeed(page);
      await page.goto("/");
      const shapes = page.locator(".cs-skeleton");
      await expect(shapes.first()).toBeVisible();
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-busy", "true");
      expect(await animationOf(page, ".cs-skeleton")).toBe("cs-shimmer");
      await expectNoHorizontalOverflow(page);

      const post = page.locator("article").filter({ hasText: words });
      await expect(post).toBeVisible();
      await expect(shapes).toHaveCount(0);
      expect(await post.evaluate((el) => getComputedStyle(el).animationName)).toBe("cs-fade-in");
    });

    test("a profile shows the shape of a profile while it loads, then the profile", async ({ page }) => {
      const me = newUser("profileshape");
      await signUpViaUi(page, me);
      await page.route("**/api/profiles/*", async (route) => {
        if (route.request().method() === "GET" && route.request().url().endsWith(me.username)) await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      await page.goto(`/u/${me.username}`);
      await expect(page.locator(".cs-skeleton").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: me.displayName })).toBeVisible();
      await expect(page.locator(".cs-skeleton")).toHaveCount(0);
    });
  });

  test.describe("when the device asks for less motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the shapes and the posts keep still: nothing shimmers and nothing fades", async ({ page }) => {
      await signUpViaUi(page, newUser("stillshape"));
      const words = unique("A post that stays still");
      await page.request.post("/api/posts", { data: { content: words } });

      await slowFeed(page);
      await page.goto("/");
      await expect(page.locator(".cs-skeleton").first()).toBeVisible();
      expect(await animationOf(page, ".cs-skeleton")).toBe("none");
      const post = page.locator("article").filter({ hasText: words });
      await expect(post).toBeVisible();
      expect(await post.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    });
  });

  test("in Arabic the shapes and the page fit the screen", async ({ page }) => {
    await signUpViaUi(page, newUser("arabicshape"));
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await slowFeed(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".cs-skeleton").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
