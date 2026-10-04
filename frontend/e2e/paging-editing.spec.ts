import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

const composer = (page: Page) => page.getByPlaceholder(/Share what you're working on/);
const bubble = (page: Page, text: string) => page.locator("div.rounded-2xl", { hasText: text });

test.describe("editing what you wrote", () => {
  test("a post can be changed, shows (edited), keeps it after a reload, and only its author sees Edit", async ({ page, browser, baseURL }) => {
    const me = newUser("editor");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "viewer");
    await befriend(page.request, friend.request, me.username);

    await composer(page).fill("A typo in my fisrt post");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const post = page.locator("article", { hasText: "A typo in my fisrt post" });
    await expect(post).toBeVisible();
    await expect(post.getByText("(edited)")).toHaveCount(0);

    await post.getByRole("button", { name: "Edit", exact: true }).click();
    const box = page.getByLabel("Edit post");
    await box.fill("No typo in my first post");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const edited = page.locator("article", { hasText: "No typo in my first post" });
    await expect(edited).toBeVisible();
    await expect(edited.getByText("(edited)")).toBeVisible();

    await page.reload();
    await expect(edited).toBeVisible();
    await expect(edited.getByText("(edited)")).toBeVisible();

    // a friend sees the new words, marked, and can't change them
    const theirs = await (await friend.request.get("/api/posts/feed")).json();
    expect(theirs.posts[0].content).toBe("No typo in my first post");
    expect(theirs.posts[0].editedAt).toBeTruthy();
    const refused = await friend.request.patch(`/api/posts/${theirs.posts[0].id}`, { data: { content: "hijacked" } });
    expect(refused.status()).toBeGreaterThanOrEqual(403);
    expect(refused.status()).toBeLessThanOrEqual(404);
  });

  test("a comment can be changed by its author", async ({ page }) => {
    await signUpViaUi(page, newUser("commenter"));
    await composer(page).fill("Post to comment on");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const post = page.locator("article", { hasText: "Post to comment on" });
    await post.getByRole("button", { name: /0 comments/ }).click();
    await post.getByPlaceholder("Write a comment…").fill("Nice wrok");
    await post.getByRole("button", { name: "Post", exact: true }).click();
    await expect(post.getByText("Nice wrok")).toBeVisible();

    await post.getByRole("button", { name: /^Edit your comment/ }).click();
    await post.getByLabel("Edit comment").fill("Nice work");
    await post.getByRole("button", { name: "Save", exact: true }).click();
    await expect(post.getByText("Nice work")).toBeVisible();
    await expect(post.getByText("(edited)")).toBeVisible();

    await page.reload();
    await post.getByRole("button", { name: /1 comment$/ }).click();
    await expect(post.getByText("Nice work")).toBeVisible();
    await expect(post.getByText("(edited)")).toBeVisible();
  });

  test("a message can be changed within fifteen minutes, and both people see it marked", async ({ page, browser, baseURL }) => {
    const me = newUser("texter");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "reader");
    await befriend(page.request, friend.request, me.username);

    await page.goto(`/messages/${friend.user.username}`);
    await page.getByLabel("Message", { exact: true }).fill("See you at 3pn");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(bubble(page, "See you at 3pn")).toBeVisible();

    await bubble(page, "See you at 3pn").getByRole("button", { name: "Edit message" }).click();
    await page.getByLabel("Edit message", { exact: true }).fill("See you at 3pm");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(bubble(page, "See you at 3pm")).toBeVisible();
    await expect(bubble(page, "See you at 3pm").getByText("(edited)")).toBeVisible();

    const theirView = await (await friend.request.get(`/api/messages/with/${me.username}`)).json();
    expect(theirView.messages[0].body).toBe("See you at 3pm");
    expect(theirView.messages[0].editedAt).toBeTruthy();
  });
});

test.describe("paging", () => {
  test("the feed shows twenty posts, then older ones on request", async ({ page, browser, baseURL }) => {
    const me = newUser("scroller");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "prolific");
    await befriend(page.request, friend.request, me.username);

    // 22 posts between the two of them, spread over two accounts so neither hits the posting limit
    for (let i = 1; i <= 11; i++) {
      expect((await friend.request.post("/api/posts", { data: { content: `friend post ${i}` } })).status()).toBe(201);
      expect((await page.request.post("/api/posts", { data: { content: `my post ${i}` } })).status()).toBe(201);
    }

    await page.goto("/");
    await expect(page.locator("article")).toHaveCount(20);
    await expect(page.getByText("my post 11")).toBeVisible(); // newest first
    await expect(page.getByText("friend post 1", { exact: true })).toHaveCount(0); // the oldest are on the next page

    await page.getByRole("button", { name: "Show older posts" }).click();
    await expect(page.locator("article")).toHaveCount(22);
    await expect(page.getByText("friend post 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show older posts" })).toHaveCount(0);
  });
});
