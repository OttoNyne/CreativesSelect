import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

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

test.describe("a pinned post and a featured piece", () => {
  test("the owner pins a post from the feed, a visitor sees it at the top of the profile, and unpinning takes it down", async ({ page, browser, baseURL }) => {
    const me = newUser("pinner");
    await signUpViaUi(page, me);
    const older = unique("An older post");
    const pinnedWords = unique("Open for commissions");
    expect((await page.request.post("/api/posts", { data: { content: older } })).status()).toBe(201);
    expect((await page.request.post("/api/posts", { data: { content: pinnedWords } })).status()).toBe(201);

    await page.goto("/");
    const card = page.getByRole("article").filter({ hasText: pinnedWords });
    await card.getByRole("button", { name: "Pin this post to the top of your profile" }).click();
    await expect(card.getByRole("button", { name: "Take this post off the top of your profile" })).toHaveAttribute("aria-pressed", "true");

    // a visitor sees it, and can't unpin it
    const visitor = await secondBrowserUser(browser, baseURL!, "visitor");
    await visitor.page.goto(`/u/${me.username}`);
    const pinned = visitor.page.getByRole("region", { name: "Pinned post" });
    await expect(pinned.getByText(pinnedWords)).toBeVisible();
    await expect(pinned.getByRole("button", { name: /top of your profile/ })).toHaveCount(0);
    await expect(visitor.page.getByText(older)).toHaveCount(0);
    await expectNoHorizontalOverflow(visitor.page);
    await expectReadable(visitor.page, "a profile with a pinned post");

    // the owner takes it down from the profile
    await page.goto(`/u/${me.username}`);
    const mine = page.getByRole("region", { name: "Pinned post" });
    await mine.getByRole("button", { name: "Take this post off the top of your profile" }).click();
    await expect(page.getByRole("region", { name: "Pinned post" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: me.displayName })).toBeVisible();
    await expect(page.getByRole("region", { name: "Pinned post" })).toHaveCount(0);
    await visitor.context.close();
  });

  test("pinning another post replaces the first", async ({ page }) => {
    await signUpViaUi(page, newUser("replacer"));
    const first = (await (await page.request.post("/api/posts", { data: { content: unique("First") } })).json()).post;
    const second = (await (await page.request.post("/api/posts", { data: { content: unique("Second") } })).json()).post;
    expect((await page.request.put(`/api/posts/${first.id}/pin`)).status()).toBe(200);
    expect((await page.request.put(`/api/posts/${second.id}/pin`)).status()).toBe(200);
    await page.goto(`/u/${(await (await page.request.get("/api/auth/me")).json()).user.username}`);
    const pinned = page.getByRole("region", { name: "Pinned post" });
    await expect(pinned.getByText(second.content)).toBeVisible();
    await expect(page.getByText(first.content)).toHaveCount(0);
  });

  test("the owner features a piece, which comes first and is marked, and others see it that way", async ({ page, browser, baseURL }) => {
    const me = newUser("featurer");
    await signUpViaUi(page, me);
    const make = async (caption: string) => (await (await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } })).json()).mediaItem;
    const oldest = await make(unique("Oldest piece"));
    await make(unique("Middle piece"));
    await make(unique("Newest piece"));

    await page.goto(`/u/${me.username}`);
    const tiles = page.locator("[id^='piece-']");
    await expect(tiles).toHaveCount(3);
    await expect(tiles.last()).toHaveAttribute("id", `piece-${oldest.id}`);
    await tiles.last().getByRole("button", { name: "Feature this piece first in your portfolio" }).click();
    await expect(tiles.first()).toHaveAttribute("id", `piece-${oldest.id}`);
    await expect(tiles.first().getByText("Featured")).toBeVisible();

    const visitor = await secondBrowserUser(browser, baseURL!, "viewer");
    await visitor.page.goto(`/u/${me.username}`);
    const seen = visitor.page.locator("[id^='piece-']");
    await expect(seen).toHaveCount(3);
    await expect(seen.first()).toHaveAttribute("id", `piece-${oldest.id}`);
    await expect(seen.first().getByText("Featured")).toBeVisible();
    await expect(visitor.page.getByRole("button", { name: /Feature this piece/ })).toHaveCount(0);
    await expectReadable(visitor.page, "a portfolio with a featured piece");

    await tiles.first().getByRole("button", { name: "Stop featuring this piece" }).click();
    await expect(tiles.last()).toHaveAttribute("id", `piece-${oldest.id}`);
    await expect(page.getByText("Featured", { exact: true })).toHaveCount(0);
    await visitor.context.close();
  });

  test("in Arabic the pinned post and the Feature button read right to left and fit the screen", async ({ page }) => {
    const me = newUser("arabicpin");
    await signUpViaUi(page, me);
    const post = (await (await page.request.post("/api/posts", { data: { content: unique("منشور مثبّت") } })).json()).post;
    await page.request.put(`/api/posts/${post.id}/pin`);
    await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: unique("عمل") } });
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/u/${me.username}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("region", { name: "منشور مثبّت" })).toBeVisible();
    await expect(page.getByRole("button", { name: "تمييز هذا العمل ليظهر أولاً في معرض أعمالك" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a profile with a pinned post in Arabic");
  });
});
