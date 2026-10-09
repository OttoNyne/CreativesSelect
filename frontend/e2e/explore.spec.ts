import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// a one-pixel picture, so nothing has to be fetched
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// letters only, so it is a valid topic; each test makes its own because the test database is shared
const topic = () => `tag${randomBytes(3).toString("hex").replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)])}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("hashtags and Explore", () => {
  test("a #hashtag in a post is a link, the topic shows its posts and pieces to anyone, and it trends", async ({ page, browser, baseURL }) => {
    const tag = topic();
    const maker = await apiUser(browser, baseURL!, "maker");
    const words = `Throwing for the show #${tag}`;
    expect((await maker.request.post("/api/posts", { data: { content: words } })).status()).toBe(201);
    expect((await maker.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: `A vase #${tag}` } })).status()).toBe(201);

    // someone who isn't signed in
    await page.goto("/explore");
    await expect(page).toHaveTitle(/Explore/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
    const chip = page.getByRole("region", { name: "Trending this week" }).getByRole("link", { name: new RegExp(`#${tag}`) });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("1 person");
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/explore\\?tag=${tag}`));
    await expect(page.getByText(words)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "Explore, one topic");

    // the pieces about it
    await page.getByRole("button", { name: "Pieces" }).click();
    await expect(page.getByRole("img", { name: `A vase #${tag}` })).toBeVisible();

    // and the link inside the post leads here too
    await page.getByRole("button", { name: "Posts" }).click();
    await page.getByRole("link", { name: "Show everything" }).or(page.getByRole("button", { name: "Show everything" })).click();
    await page.getByRole("link", { name: `#${tag}` }).first().click();
    await expect(page).toHaveURL(new RegExp(`tag=${tag}`));
    await maker.context.close();
  });

  test("searching a topic by hand, and the message for something that can't be one", async ({ page, browser, baseURL }) => {
    const tag = topic();
    const maker = await apiUser(browser, baseURL!, "searchable");
    await maker.request.post("/api/posts", { data: { content: `Searchable #${tag}` } });
    await page.goto("/explore");
    const box = page.getByRole("textbox", { name: "Search a topic" });
    await box.fill("two words");
    await box.press("Enter");
    await expect(page.getByRole("alert")).toHaveText("A topic is one word of letters, numbers or underscores.");
    await box.fill(`#${tag.toUpperCase()}`);
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`tag=${tag}`));
    await expect(page.getByText(`Searchable #${tag}`)).toBeVisible();
    await maker.context.close();
  });

  test("a person posting from the feed makes the tag a link, and a private profile's posts are not on Explore", async ({ page, browser, baseURL }) => {
    const tag = topic();
    const me = newUser("poster");
    await signUpViaUi(page, me);
    await page.getByPlaceholder(/Share what you're working on/).fill(`Hello #${tag}`);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByRole("link", { name: `#${tag}` })).toHaveAttribute("href", `/explore?tag=${tag}`);

    const hidden = await apiUser(browser, baseURL!, "hushed");
    const hiddenTag = topic();
    await hidden.request.post("/api/posts", { data: { content: `Secret #${hiddenTag}` } });
    await hidden.request.patch("/api/profiles/me", { data: { isPrivate: true } });
    await page.goto(`/explore?tag=${hiddenTag}`);
    await expect(page.getByText(`Nothing about #${hiddenTag} yet. Be the first!`)).toBeVisible();
    await expect(page.getByText(`Secret #${hiddenTag}`)).toHaveCount(0);
    await hidden.context.close();
  });

  test("Explore is in the menu, and in Arabic it reads right to left, fits the screen and finds an Arabic topic", async ({ page, browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "arabicmaker");
    const arabicTag = `الخزف_${topic()}`; // one of its own, as the test database is shared
    await maker.request.post("/api/posts", { data: { content: `أحب #${arabicTag}` } });
    await page.goto("/explore");
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/explore?tag=" + encodeURIComponent(arabicTag));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "استكشاف", exact: true })).toBeVisible();
    await expect(page.getByText(`أحب #${arabicTag}`)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "Explore in Arabic");
    await maker.context.close();
  });

  test("the top bar links to Explore for a signed-in person", async ({ page }) => {
    await signUpViaUi(page, newUser("navigator"));
    const menu = page.getByRole("button", { name: "Menu" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Explore", exact: true }).first().click();
    await expect(page).toHaveURL(/\/explore$/);
  });
});
