import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;
const pad = (n: number) => String(n).padStart(2, "0");
/** A datetime-local value (the browser's own time zone) some days from now. */
const inDays = (days: number, hour = 9, minute = 30) => {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
};

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

const composer = (page: Page) => page.locator("#post-composer");

test.describe("scheduled posts", () => {
  test("a post is scheduled from the feed, kept out of everyone's feed, changed, and published now", async ({ page, browser, baseURL }) => {
    const me = newUser("planner");
    await signUpViaUi(page, me);
    const follower = await secondBrowserUser(browser, baseURL!, "audience");
    expect((await follower.page.request.post(`/api/follows/${me.username}`)).status()).toBe(201);

    // write it, choose a day, schedule it
    const words = unique("Opening night is on Friday");
    await page.goto("/");
    await composer(page).fill(words);
    await page.getByRole("button", { name: "Schedule for later" }).click();
    await page.getByLabel("Publish on").fill(inDays(3));
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the composer with a time chosen");
    await page.getByRole("button", { name: "Schedule post" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Scheduled for" })).toBeVisible();
    await expect(composer(page)).toHaveValue("");

    // it is a waiting post, not a post: nobody's feed has it, and neither has the profile
    await follower.page.goto("/");
    await expect(follower.page.getByText(words)).toHaveCount(0);
    expect((await follower.page.request.get(`/api/posts/user/${me.username}`)).ok()).toBeTruthy();
    expect(JSON.stringify(await (await follower.page.request.get(`/api/posts/user/${me.username}`)).json())).not.toContain(words);

    // the owner sees it, waiting, and changes the words
    const list = page.getByRole("button", { name: "Scheduled posts (1)" });
    await list.click();
    const scheduled = page.getByRole("region", { name: "Scheduled posts (1)" });
    await expect(scheduled.getByText(words)).toBeVisible();
    await expectReadable(page, "the scheduled posts list");
    await scheduled.getByRole("button", { name: /^Edit scheduled post/ }).click();
    const better = `${words} (doors at eight)`;
    await scheduled.getByLabel("Words").fill(better);
    await scheduled.getByRole("button", { name: "Save" }).click();
    await expect(scheduled.getByText(better)).toBeVisible();

    // publish now: it is a post at the top of the feed, the list is gone, and the person is told
    await scheduled.getByRole("button", { name: /^Post now/ }).click();
    await expect(page.locator("article").filter({ hasText: better }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Scheduled posts/ })).toHaveCount(0);
    await follower.page.reload();
    await expect(follower.page.locator("article").filter({ hasText: better }).first()).toBeVisible();
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Your scheduled post is now live")).toBeVisible();
    await follower.context.close();
  });

  test("one can be taken back, and a time that is too soon or too far is turned away", async ({ page }) => {
    await signUpViaUi(page, newUser("changer"));
    const words = unique("Not after all");
    await page.goto("/");
    await composer(page).fill(words);
    await page.getByRole("button", { name: "Schedule for later" }).click();
    await page.getByRole("button", { name: "Schedule post" }).click();
    await expect(page.getByText("Choose when it should be published.")).toBeVisible();
    await page.getByLabel("Publish on").fill(inDays(120));
    await page.getByRole("button", { name: "Schedule post" }).click();
    await expect(page.getByText("Posts can be scheduled up to 90 days ahead")).toBeVisible();
    await page.getByLabel("Publish on").fill(inDays(2));
    await page.getByRole("button", { name: "Schedule post" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Scheduled for" })).toBeVisible();

    await page.getByRole("button", { name: "Scheduled posts (1)" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^Remove scheduled post/ }).click();
    await expect(page.getByRole("button", { name: /Scheduled posts/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: /Scheduled posts/ })).toHaveCount(0);
  });

  test("a post goes out by itself when its time comes", async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000);
    const me = newUser("clockwork");
    await signUpViaUi(page, me);
    const follower = await secondBrowserUser(browser, baseURL!, "waiter");
    await follower.page.request.post(`/api/follows/${me.username}`);
    const words = unique("Right on time");
    const made = await page.request.post("/api/scheduled-posts", { data: { content: words, publishAt: new Date(Date.now() + 70_000).toISOString() } });
    expect(made.status()).toBe(201);
    await expect(page.getByRole("button", { name: /Scheduled posts/ })).toHaveCount(0);

    // nothing yet
    expect(JSON.stringify(await (await follower.page.request.get("/api/posts/feed")).json())).not.toContain(words);
    // then it is in the feed (looking at notifications is what lets a sleeping server catch up, and the timer does it too)
    await expect
      .poll(
        async () => {
          await follower.page.request.get("/api/notifications");
          return JSON.stringify(await (await follower.page.request.get("/api/posts/feed")).json()).includes(words);
        },
        { timeout: 120_000, intervals: [3000] }
      )
      .toBe(true);
    await follower.page.goto("/");
    await expect(follower.page.locator("article").filter({ hasText: words }).first()).toBeVisible();
    // and nothing is left waiting
    expect((await (await page.request.get("/api/scheduled-posts")).json()).posts).toEqual([]);
    await follower.context.close();
  });

  test("in Arabic the composer's schedule button, the time box and the list read right to left and fit the screen", async ({ page }) => {
    await signUpViaUi(page, newUser("arabicplanner"));
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await composer(page).fill("مساء الجمعة");
    await page.getByRole("button", { name: "جدولة للنشر لاحقًا" }).click();
    await page.getByLabel("النشر في").fill(inDays(4));
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the composer in Arabic with a time chosen");
    await page.getByRole("button", { name: "جدولة المنشور" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تمت الجدولة" })).toBeVisible();
    await page.getByRole("button", { name: "المنشورات المجدولة (1)" }).click();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the scheduled list in Arabic");
  });
});
