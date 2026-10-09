import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

// the post page opens with its comments showing (it is where a notification leads); anywhere else the toggle has to be pressed
async function openComments(page: Page) {
  const box = page.getByPlaceholder(/Write a (comment|reply)|اكتب/);
  await page.getByText(/comment|تعليق/i).first().waitFor();
  if (!(await box.isVisible())) await page.getByRole("button", { name: /comment|تعليق/i }).first().click();
  await expect(box).toBeVisible();
}

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("replies in comment threads", () => {
  test("a reply sits under its comment, the person answered is told, and the notice leads to the reply", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "writer");
    const made = await author.request.post("/api/posts", { data: { content: unique("A post with a thread") } });
    const postId = (await made.json()).post.id;
    const me = newUser("commenter");
    await signUpViaUi(page, me);
    const top = unique("First comment");
    expect((await page.request.post(`/api/posts/${postId}/comments`, { data: { content: top } })).status()).toBe(201);

    const other = await secondBrowserUser(browser, baseURL!, "replier");
    await other.page.goto(`/posts/${postId}`);
    await openComments(other.page);
    await expect(other.page.getByText(top)).toBeVisible();
    await other.page.getByRole("button", { name: `Reply to ${me.displayName}` }).click();
    await expect(other.page.getByText(`Replying to ${me.displayName}`)).toBeVisible();
    const reply = unique("My reply");
    const input = other.page.getByPlaceholder("Write a reply…");
    await expect(input).toHaveValue(`@${me.username} `);
    await input.press("End");
    await input.pressSequentially(reply);
    await input.press("Enter");
    const replyRow = other.page.locator("[id^='comment-'].ms-8").filter({ hasText: reply });
    await expect(replyRow).toBeVisible();
    await expect(replyRow.getByRole("link", { name: `@${me.username}` })).toHaveAttribute("href", `/u/${me.username}`);
    await expectNoHorizontalOverflow(other.page);
    await expectReadable(other.page, "a thread with a reply");

    // the person answered is told, and the bell leads to the reply
    await expect.poll(async () => (await (await page.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "reply")).toBe(true);
    await page.goto("/");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("replied to your comment")).toBeVisible();
    await page.getByRole("link", { name: "View reply" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/posts/${postId}\\?comment=`));
    await expect(page.locator("[id^='comment-'][aria-current='true']")).toContainText(reply);

    // taking the comment down takes the reply with it
    expect((await page.request.get(`/api/posts/${postId}/comments`)).status()).toBe(200);
    const list = (await (await page.request.get(`/api/posts/${postId}/comments`)).json()).comments;
    const topComment = list.find((c: { content: string }) => c.content === top);
    expect((await page.request.delete(`/api/comments/${topComment.id}`)).status()).toBe(204);
    expect((await (await page.request.get(`/api/posts/${postId}/comments`)).json()).comments).toEqual([]);
    await other.context.close();
    await author.context.close();
  });

  test("a reply to a reply goes under the same comment, and cancelling goes back to an ordinary comment", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "owner");
    const postId = (await (await author.request.post("/api/posts", { data: { content: unique("Thread") } })).json()).post.id;
    await signUpViaUi(page, newUser("deep"));
    const first = (await (await page.request.post(`/api/posts/${postId}/comments`, { data: { content: unique("Top") } })).json()).comment;
    const nested = (await (await author.request.post(`/api/posts/${postId}/comments`, { data: { content: unique("Level one"), parent: first.id } })).json()).comment;
    const deeper = await page.request.post(`/api/posts/${postId}/comments`, { data: { content: unique("Level two"), parent: nested.id } });
    expect(deeper.status()).toBe(201);
    expect((await deeper.json()).comment.parent).toBe(first.id);

    await page.goto(`/posts/${postId}`);
    await openComments(page);
    await expect(page.locator("[id^='comment-'].ms-8")).toHaveCount(2);
    await page.getByRole("button", { name: /^Reply to/ }).first().click();
    await expect(page.getByText(/^Replying to/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/^Replying to/)).toHaveCount(0);
    await expect(page.getByPlaceholder("Write a comment…")).toBeVisible();
    await author.context.close();
  });

  test("in Arabic the thread reads right to left with the replies indented from the right, and fits the screen", async ({ page, browser, baseURL }) => {
    const author = await apiUser(browser, baseURL!, "arabicowner");
    const postId = (await (await author.request.post("/api/posts", { data: { content: unique("منشور") } })).json()).post.id;
    await signUpViaUi(page, newUser("arabicreplier"));
    const top = (await (await page.request.post(`/api/posts/${postId}/comments`, { data: { content: unique("تعليق") } })).json()).comment;
    await author.request.post(`/api/posts/${postId}/comments`, { data: { content: unique("رد"), parent: top.id } });
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/posts/${postId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await openComments(page);
    const reply = page.locator("[id^='comment-'].ms-8");
    await expect(reply).toBeVisible();
    // the indent is on the start side: in right-to-left that is the right edge, so the reply's left edge is not the top comment's
    const box = await reply.boundingBox();
    const parentBox = await page.locator(`[id='comment-${top.id}']`).boundingBox();
    expect(box!.x + box!.width).toBeLessThan(parentBox!.x + parentBox!.width);
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a thread in Arabic");
    await author.context.close();
  });
});
