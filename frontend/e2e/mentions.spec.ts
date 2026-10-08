import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { befriend, expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("@mentions", () => {
  test("typing @ offers friends, the pick goes in as a link, and the person is told and taken to the post", async ({ page, browser, baseURL }) => {
    const me = newUser("writer");
    await signUpViaUi(page, me);
    const friend = await secondBrowserUser(browser, baseURL!, "mentionee");
    await befriend(page.request, friend.context.request, me.username);

    await page.goto("/");
    const box = page.getByPlaceholder(/Share what you're working on/);
    await box.fill("Thanks for the help ");
    await box.pressSequentially("@mentionee");
    const list = page.getByRole("listbox", { name: "People you can mention" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option", { name: new RegExp(`@${friend.user.username}`) })).toContainText("Friend");
    await expectReadable(page, "the list of people to mention");
    await list.getByRole("option", { name: new RegExp(`@${friend.user.username}`) }).click();
    await expect(box).toHaveValue(`Thanks for the help @${friend.user.username} `);
    await page.getByRole("button", { name: "Post", exact: true }).click();

    // in the post it is a link to their profile
    const link = page.getByRole("link", { name: `@${friend.user.username}` }).first();
    await expect(link).toHaveAttribute("href", `/u/${friend.user.username}`);

    // they are told, from the bell, and it leads to the post
    await expect.poll(async () => (await (await friend.context.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "mention")).toBe(true);
    await friend.page.goto("/");
    await friend.page.getByRole("button", { name: /Notifications/ }).first().click();
    await expect(friend.page.getByText("mentioned you")).toBeVisible();
    await friend.page.getByRole("link", { name: "See where" }).first().click();
    await expect(friend.page).toHaveURL(/\/posts\//);
    await expect(friend.page.getByRole("link", { name: `@${friend.user.username}` })).toBeVisible();
    await friend.context.close();
  });

  test("the keyboard works in a comment, and Enter does not send while the list is open", async ({ page, browser, baseURL }) => {
    const me = newUser("commenter");
    await signUpViaUi(page, me);
    const friend = await secondBrowserUser(browser, baseURL!, "keyfriend");
    await befriend(page.request, friend.context.request, me.username);
    const made = await page.request.post("/api/posts", { data: { content: "A post to comment on" } });
    const postId = (await made.json()).post.id;

    await page.goto(`/posts/${postId}`);
    const comment = page.getByPlaceholder(/Write a comment|comment/i).first();
    await comment.pressSequentially(`cc @keyfriend`);
    const list = page.getByRole("listbox", { name: "People you can mention" });
    await expect(list.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Enter"); // chooses, does not send
    await expect(comment).toHaveValue(`cc @${friend.user.username} `);
    await expect(list).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByRole("link", { name: `@${friend.user.username}` })).toBeVisible();
    await expect.poll(async () => (await (await friend.context.request.get("/api/notifications")).json()).notifications.filter((n: { type: string }) => n.type === "mention").length).toBe(1);
    await friend.context.close();
  });

  test("a name that is nobody's stays plain text and tells nobody, and a post is made all the same", async ({ page }) => {
    await signUpViaUi(page, newUser("lonely"));
    await page.goto("/");
    await page.getByPlaceholder(/Share what you're working on/).fill("Hello @nobodyatall123 and mail me at me@example.com");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(/Hello/)).toBeVisible();
    await expect(page.getByRole("link", { name: "@nobodyatall123" })).toHaveAttribute("href", "/u/nobodyatall123");
    await expect(page.getByRole("link", { name: /example\.com/ })).toHaveCount(0);
  });

  test("in Arabic the list reads right to left, stays on the screen and is readable", async ({ page, browser, baseURL }) => {
    const me = newUser("arabicwriter");
    await signUpViaUi(page, me);
    const friend = await secondBrowserUser(browser, baseURL!, "arabicfriend");
    await befriend(page.request, friend.context.request, me.username);
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.locator("#post-composer").pressSequentially("@arabicfriend");
    const list = page.getByRole("listbox", { name: "أشخاص يمكنك الإشارة إليهم" });
    await expect(list).toBeVisible();
    const box = await list.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Arabic list of people to mention");
    await friend.context.close();
  });
});
