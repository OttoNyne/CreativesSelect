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
const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("saving and sharing", () => {
  test("a post is saved to a private list, and can be taken out of it from there", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "author");
    const words = unique("A post to keep");
    expect((await author.request.post("/api/posts", { data: { content: words } })).status()).toBe(201);
    const me = newUser("saver");
    await signUpViaUi(page, me);
    expect((await page.request.post(`/api/follows/${author.user.username}`)).status()).toBe(201);

    await page.goto("/");
    const card = page.getByRole("article").filter({ hasText: words });
    await card.getByRole("button", { name: "Save this post" }).click();
    await expect(card.getByRole("button", { name: "Remove this post from your saved list" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/saved");
    await expect(page).toHaveTitle(/Saved/);
    const saved = page.getByRole("article").filter({ hasText: words });
    await expect(saved).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the saved list");
    // it is private: the author can't see it
    expect((await (await author.request.get("/api/saves?type=posts")).json()).posts).toEqual([]);

    await saved.getByRole("button", { name: "Remove this post from your saved list" }).click();
    await expect(page.getByRole("article").filter({ hasText: words })).toHaveCount(0);
    await expect(page.getByText(/Nothing saved yet/)).toBeVisible();
    await author.context.close();
  });

  test("a piece is saved from Explore and found in the Pieces tab of the saved list", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "maker");
    const caption = unique("A saved vase");
    const tag = `keep${randomBytes(3).toString("hex").replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)])}`;
    expect((await author.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: `${caption} #${tag}` } })).status()).toBe(201);
    await signUpViaUi(page, newUser("piecesaver"));
    await page.goto(`/explore?tag=${tag}&type=pieces`);
    await page.getByRole("button", { name: "Save this piece" }).click();
    await expect(page.getByRole("button", { name: "Remove this piece from your saved list" })).toBeVisible();
    await page.goto("/saved");
    await page.getByRole("button", { name: "Pieces" }).click();
    await expect(page.getByRole("img", { name: new RegExp(caption) })).toBeVisible();
    await author.context.close();
  });

  test("a post is shared to your feed with your own words, the original shows inside, and the author is told", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "original");
    const words = unique("The original words");
    expect((await author.request.post("/api/posts", { data: { content: words } })).status()).toBe(201);
    const me = newUser("sharer");
    await signUpViaUi(page, me);
    expect((await page.request.post(`/api/follows/${author.user.username}`)).status()).toBe(201);

    await page.goto("/");
    const card = page.getByRole("article").filter({ hasText: words }).first();
    await card.getByRole("button", { name: "Share this post to your feed" }).click();
    const mine = unique("My take");
    await card.getByRole("textbox", { name: "Add your own words (optional)" }).fill(mine);
    await card.getByRole("button", { name: "Share to my feed" }).click();
    await expect(card.getByRole("status")).toHaveText("Shared to your feed.");

    await page.reload();
    const shared = page.getByRole("article").filter({ hasText: mine });
    await expect(shared).toBeVisible();
    await expect(shared).toContainText("shared a post");
    await expect(shared).toContainText(words);
    await expect(shared.getByRole("link", { name: "View the post" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a shared post");

    await expect.poll(async () => (await (await author.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "repost")).toBe(true);
    await author.context.close();
  });

  test("a share shows 'not available' once the original's owner goes private", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "fading");
    const words = unique("Soon private");
    const made = await author.request.post("/api/posts", { data: { content: words } });
    await signUpViaUi(page, newUser("keeper"));
    const shared = await page.request.post(`/api/posts/${(await made.json()).post.id}/repost`, { data: { content: "keeping this" } });
    expect(shared.status()).toBe(201);
    await page.goto("/");
    await expect(page.getByRole("article").filter({ hasText: "keeping this" })).toContainText(words);
    await author.request.patch("/api/profiles/me", { data: { isPrivate: true } });
    await page.reload();
    const card = page.getByRole("article").filter({ hasText: "keeping this" });
    await expect(card).toContainText("This post isn't available any more.");
    await expect(card).not.toContainText(words);
    await author.context.close();
  });

  test("your own post can't be shared, it can be saved, and the top bar links to Saved", async ({ page }) => {
    const me = newUser("owner");
    await signUpViaUi(page, me);
    await page.getByPlaceholder(/Share what you're working on/).fill(unique("Mine"));
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByRole("article").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Share this post to your feed" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save this post" }).first()).toBeVisible();
    const menu = page.getByRole("button", { name: "Menu" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Saved", exact: true }).first().click();
    await expect(page).toHaveURL(/\/saved$/);
  });

  test("in Arabic the Save and Share buttons read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "arabicauthor");
    await author.request.post("/api/posts", { data: { content: unique("منشور") } });
    await signUpViaUi(page, newUser("arabicsaver"));
    await page.request.post(`/api/follows/${author.user.username}`);
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: "حفظ هذا المنشور" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "مشاركة هذا المنشور في صفحتك الرئيسية" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the feed in Arabic with Save and Share");
    await author.context.close();
  });
});
