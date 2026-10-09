import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("polls in posts", () => {
  test("someone asks a poll from the feed, another person votes once and sees the results, and the asker sees the count", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("asker"));
    const question = unique("Which colour for the cover?");
    await page.getByPlaceholder(/Share what you're working on/).fill(question);
    await page.getByRole("button", { name: "Add a poll" }).click();
    await page.getByRole("textbox", { name: "Option 1" }).fill("Deep blue");
    await page.getByRole("textbox", { name: "Option 2" }).fill("Forest green");
    await page.getByRole("button", { name: "+ Add an option" }).click();
    await page.getByRole("textbox", { name: "Option 3" }).fill("Warm red");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Post", exact: true }).click();

    // it is in their own feed with its options as buttons, and the poll form is gone
    const card = page.getByRole("article").filter({ hasText: question });
    await expect(card.getByRole("button", { name: "Vote for Deep blue" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Option 1" })).toHaveCount(0);
    const postId = (await (await page.request.get("/api/posts/feed")).json()).posts.find((p: { content: string }) => p.content === question).id;

    // another person votes
    const voter = await secondBrowserUser(browser, baseURL!, "voter");
    await voter.page.goto(`/posts/${postId}`);
    const poll = voter.page.getByRole("group", { name: "Poll" });
    await poll.getByRole("button", { name: "Vote for Forest green" }).click();
    await expect(poll.getByRole("button")).toHaveCount(0);
    await expect(poll.getByText("100%")).toBeVisible();
    await expect(poll.getByText(/Your vote/)).toBeVisible();
    await expect(poll.getByText(/1 vote/)).toBeVisible();
    await expectNoHorizontalOverflow(voter.page);
    await expectReadable(voter.page, "a poll after voting");

    // a vote is final, and survives a reload
    expect((await voter.context.request.put(`/api/posts/${postId}/poll/vote`, { data: { option: 0 } })).status()).toBe(409);
    await voter.page.reload();
    await expect(voter.page.getByRole("group", { name: "Poll" }).getByText(/Your vote/)).toBeVisible();

    // the asker sees the count, and can still vote themselves
    await page.reload();
    const mine = page.getByRole("article").filter({ hasText: question }).getByRole("group", { name: "Poll" });
    await expect(mine.getByRole("button", { name: "Vote for Deep blue" })).toBeVisible();
    await expect(mine.getByText(/1 vote/)).toBeVisible();
    await voter.context.close();
  });

  test("the poll form asks for two options, and takes away what it was given when it is removed", async ({ page }) => {
    await signUpViaUi(page, newUser("tidy"));
    await page.getByPlaceholder(/Share what you're working on/).fill(unique("A question"));
    await page.getByRole("button", { name: "Add a poll" }).click();
    await page.getByRole("textbox", { name: "Option 1" }).fill("Only one");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("A poll needs at least two options with words in them.")).toBeVisible();
    await page.getByRole("button", { name: "Remove poll" }).click();
    await expect(page.getByRole("group", { name: "Poll" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add a poll" })).toBeVisible();
  });

  test("in Arabic the poll form and the results read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("arabicpoll"));
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("button", { name: "إضافة استطلاع" }).click();
    await expect(page.getByRole("textbox", { name: "الخيار 1" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the poll form in Arabic");

    const made = await page.request.post("/api/posts", { data: { content: unique("سؤال"), poll: { options: ["نعم", "لا"], days: 3 } } });
    const postId = (await made.json()).post.id;
    const voter = await secondBrowserUser(browser, baseURL!, "arabicvoter");
    await voter.page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await voter.page.goto(`/posts/${postId}`);
    const poll = voter.page.getByRole("group", { name: "استطلاع" });
    await poll.getByRole("button", { name: "التصويت لـ نعم" }).click();
    await expect(poll.getByText(/صوتك/)).toBeVisible();
    await expectNoHorizontalOverflow(voter.page);
    await expectReadable(voter.page, "a poll in Arabic");
    await voter.context.close();
  });
});
