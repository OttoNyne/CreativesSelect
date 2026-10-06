import { expect, test } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

test.describe("emoji reactions on posts", () => {
  test("a friend reacts, the author is told and sees it, reacts too, switches and takes theirs away", async ({ page, browser, baseURL }) => {
    const me = newUser("poster");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "reactor");
    await befriend(page.request, friend.request, me.username);
    const post = (await (await page.request.post("/api/posts", { data: { content: `A post to react to ${me.username}` } })).json()).post;

    expect((await friend.request.put(`/api/posts/${post.id}/reaction`, { data: { emoji: "love" } })).status()).toBe(200);
    await page.goto("/");
    await expect(page.getByText(`A post to react to ${me.username}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Love: 1" })).toHaveAttribute("aria-pressed", "false"); // the friend's, not mine

    // the author reacts too, then switches, then takes it away
    const pick = async (name: string) => {
      await page.getByRole("button", { name: "Add a reaction" }).click();
      await page.getByRole("group", { name: "Pick a reaction" }).getByRole("button", { name, exact: true }).click();
    };
    await pick("Fire");
    await expect(page.getByRole("button", { name: "Fire: 1, your reaction" })).toBeVisible();
    await pick("Haha");
    await expect(page.getByRole("button", { name: "Haha: 1, your reaction" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Fire: / })).toHaveCount(0);
    await page.getByRole("button", { name: "Haha: 1, your reaction" }).click();
    await expect(page.getByRole("button", { name: /^Haha: / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Love: 1" })).toBeVisible();

    // it survives a reload, and the author was told about the friend's reaction (and not about their own)
    await page.reload();
    await expect(page.getByRole("button", { name: "Love: 1" })).toBeVisible();
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("reacted ❤️ to your post")).toBeVisible();
    await expect(page.getByText(/reacted (🔥|😂)/)).toHaveCount(0);
    await friend.context.close();
  });

  test("a notification about a reaction opens the post", async ({ page, browser, baseURL }) => {
    const me = newUser("notified");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "fan");
    await befriend(page.request, friend.request, me.username);
    const post = (await (await page.request.post("/api/posts", { data: { content: "Notice me" } })).json()).post;
    await friend.request.put(`/api/posts/${post.id}/reaction`, { data: { emoji: "wow" } });
    await page.goto("/friends");
    await page.getByRole("button", { name: "Notifications" }).click();
    await page.getByText("reacted 😮 to your post").click();
    await expect(page).toHaveURL(new RegExp(`/posts/${post.id}`));
    await expect(page.getByRole("button", { name: "Wow: 1" })).toBeVisible();
    await friend.context.close();
  });

  test("only someone who can see a post can react to it, and only to the six", async ({ page, browser, baseURL }) => {
    const me = newUser("private");
    await signUpViaUi(page, me);
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    const post = (await (await page.request.post("/api/posts", { data: { content: "Only for friends" } })).json()).post;
    const stranger = await apiUser(browser, baseURL!, "stranger");
    expect((await stranger.request.put(`/api/posts/${post.id}/reaction`, { data: { emoji: "like" } })).status()).toBe(404);
    expect((await page.request.put(`/api/posts/${post.id}/reaction`, { data: { emoji: "thumbsup" } })).status()).toBe(400);
    expect((await page.request.put(`/api/posts/${post.id}/reaction`, { data: { value: 1 } })).status()).toBe(400);
    expect((await (await page.request.put(`/api/posts/${post.id}/reaction`, { data: { emoji: "like" } })).json()).reactions.mine).toBe("like");
    await stranger.context.close();
  });
});
