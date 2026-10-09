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

/** Press a Report button, give a reason and send it. */
async function report(scope: ReturnType<Page["locator"]> | Page, button: string, reason: string) {
  await scope.getByRole("button", { name: button }).click();
  await scope.getByLabel("What's the issue?").fill(reason);
  await scope.getByRole("button", { name: "Send report" }).click();
  await expect(scope.getByText("Thanks. A moderator will take a look.").last()).toBeVisible();
}

test.describe("reporting posts, pieces, steps, calls and answers", () => {
  test("someone else's post, piece and step can each be reported, and your own cannot", async ({ page, browser, baseURL }) => {
    const owner = await secondBrowserUser(browser, baseURL!, "maker");
    const words = unique("A post to report");
    const post = (await (await owner.page.request.post("/api/posts", { data: { content: words } })).json()).post;
    const caption = unique("A piece to report");
    const piece = (await (await owner.page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } })).json()).mediaItem;
    await owner.page.request.post(`/api/media/${piece.id}/process`, { data: { content: unique("A step to report") } });

    await signUpViaUi(page, newUser("reporter"));
    await page.goto(`/posts/${post.id}`);
    const card = page.getByRole("article").filter({ hasText: words });
    await report(card, "Report this post", "Not appropriate");
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a reported post");

    await page.goto(`/u/${owner.user.username}`);
    const tile = page.locator("[id^='piece-']").filter({ hasText: caption });
    await report(tile, "Report this piece", "Stolen work");
    await tile.getByRole("button", { name: /How it was made/ }).click();
    await report(tile, "Report this step", "Off topic");

    // the owner is offered none of these on their own things
    await owner.page.goto(`/posts/${post.id}`);
    await expect(owner.page.getByRole("button", { name: "Report this post" })).toHaveCount(0);
    await owner.page.goto(`/u/${owner.user.username}`);
    await expect(owner.page.getByRole("button", { name: "Report this piece" })).toHaveCount(0);
    await owner.context.close();
  });

  test("a call can be reported by someone else, and its owner can report an answer", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("caller"));
    const title = unique("A call to report");
    const call = (await (await page.request.post("/api/calls", { data: { title, details: "Details" } })).json()).call;
    const other = await secondBrowserUser(browser, baseURL!, "answerer");
    await other.page.goto(`/calls/${call.id}`);
    await other.page.getByLabel("A few words about why you fit").fill("An answer worth reporting");
    await other.page.getByRole("button", { name: "Send answer" }).click();
    await expect(other.page.getByRole("heading", { name: /Your answer/ })).toBeVisible();
    await report(other.page, "Report this call", "Looks like spam");

    await page.goto(`/calls/${call.id}`);
    await expect(page.getByRole("button", { name: "Report this call" })).toHaveCount(0);
    const answers = page.getByRole("region", { name: "Answers" });
    await report(answers, `Report this answer from ${other.user.displayName}`, "Abusive");
    await expectReadable(page, "a reported answer");
    await other.context.close();
  });

  test("in Arabic the report box reads right to left and fits the screen", async ({ page, browser, baseURL }) => {
    const owner = await secondBrowserUser(browser, baseURL!, "arabicmaker");
    const post = (await (await owner.page.request.post("/api/posts", { data: { content: unique("منشور") } })).json()).post;
    await signUpViaUi(page, newUser("arabicreporter"));
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/posts/${post.id}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("button", { name: "الإبلاغ عن هذا المنشور" }).click();
    await expect(page.getByLabel("ما المشكلة؟")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the report box in Arabic");
    await page.getByLabel("ما المشكلة؟").fill("غير مناسب");
    await page.getByRole("button", { name: "إرسال البلاغ" }).click();
    await expect(page.getByText("شكرًا. سيلقي أحد المشرفين نظرة عليه.")).toBeVisible();
    await owner.context.close();
  });
});
