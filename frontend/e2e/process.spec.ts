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

test.describe("process: how a piece was made", () => {
  test("the owner adds steps and puts them in order, and a visitor walks through them to the finished piece", async ({ page, browser, baseURL }) => {
    const me = newUser("maker");
    await signUpViaUi(page, me);
    const caption = unique("A glazed vase");
    expect((await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } })).status()).toBe(201);

    await page.goto(`/u/${me.username}`);
    const tile = page.locator("[id^='piece-']").filter({ hasText: caption });
    await tile.getByRole("button", { name: "Show how it was made" }).click();
    const first = unique("First sketch");
    const second = unique("Throwing the shape");
    const third = unique("Glaze test");
    for (const words of [first, third, second]) {
      await tile.getByRole("textbox", { name: "Words for the new step" }).fill(words);
      await tile.getByRole("button", { name: "Add step" }).click();
      await expect(tile.getByRole("listitem").filter({ hasText: words })).toBeVisible();
    }
    // the second and third were added in the wrong order: move the glaze test down
    await tile.getByRole("button", { name: "Move step 2 down" }).click();
    await expect(tile.getByRole("button", { name: "Move step 3 up" })).toBeEnabled();
    await expectNoHorizontalOverflow(page);

    // a visitor sees the count, opens the steps and walks to the end
    const visitor = await secondBrowserUser(browser, baseURL!, "walker");
    await visitor.page.goto(`/u/${me.username}`);
    const theirs = visitor.page.locator("[id^='piece-']").filter({ hasText: caption });
    await theirs.getByRole("button", { name: "How it was made (3)" }).click();
    await expect(theirs.getByText("Step 1 of 3")).toBeVisible();
    await expect(theirs.getByText(first)).toBeVisible();
    await expect(theirs.getByRole("button", { name: "Delete step 1" })).toHaveCount(0);
    await theirs.getByRole("button", { name: "Next step" }).click();
    await expect(theirs.getByText("Step 2 of 3")).toBeVisible();
    await expect(theirs.getByText(second)).toBeVisible(); // the order the owner chose
    await theirs.getByRole("button", { name: "Next step" }).click();
    await expect(theirs.getByText(third)).toBeVisible();
    await theirs.getByRole("button", { name: "Next step" }).click();
    await expect(theirs.getByText("The finished piece")).toBeVisible();
    await expect(theirs.getByRole("button", { name: "Next step" })).toBeDisabled();
    await expectNoHorizontalOverflow(visitor.page);
    await expectReadable(visitor.page, "a piece's process");

    // the owner takes one away
    page.once("dialog", (d) => d.accept());
    await tile.getByRole("button", { name: "Delete step 1" }).click();
    await expect(tile.getByRole("button", { name: "How it was made (2)" })).toBeVisible();
    await visitor.context.close();
  });

  test("a piece without steps shows a visitor nothing", async ({ page, browser, baseURL }) => {
    const me = newUser("plain");
    await signUpViaUi(page, me);
    const caption = unique("A plain piece");
    await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } });
    const visitor = await secondBrowserUser(browser, baseURL!, "looker");
    await visitor.page.goto(`/u/${me.username}`);
    await expect(visitor.page.locator("[id^='piece-']").filter({ hasText: caption })).toBeVisible();
    await expect(visitor.page.getByRole("button", { name: /How it was made/ })).toHaveCount(0);
    await visitor.context.close();
  });

  test("in Arabic the steps read right to left and fit the screen", async ({ page }) => {
    const me = newUser("arabicprocess");
    await signUpViaUi(page, me);
    const piece = (await (await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: unique("عمل") } })).json()).mediaItem;
    await page.request.post(`/api/media/${piece.id}/process`, { data: { content: "رسم أولي" } });
    await page.request.post(`/api/media/${piece.id}/process`, { data: { content: "التلوين" } });
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/u/${me.username}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("button", { name: "كيف صُنع (2)" }).click();
    await expect(page.getByText("الخطوة 1 من 2")).toBeVisible();
    await expect(page.getByText("رسم أولي").first()).toBeVisible();
    await page.getByRole("button", { name: "الخطوة التالية" }).click();
    await expect(page.getByText("الخطوة 2 من 2")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a piece's process in Arabic");
  });
});
