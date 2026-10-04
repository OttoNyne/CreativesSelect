import { expect, test } from "@playwright/test";
import { befriend, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

test.describe("online now", () => {
  test("a friend sees you're online, a stranger doesn't, and turning it off hides it", async ({ page, browser, baseURL }) => {
    const me = newUser("present");
    await signUpViaUi(page, me); // landing on the feed checks in
    const friend = await secondBrowserUser(browser, baseURL!, "pal");
    const stranger = await secondBrowserUser(browser, baseURL!, "outsider");
    await befriend(page.request, friend.context.request, me.username);

    // the friend sees it on the profile, in the friends list and in the conversations
    await friend.page.goto(`/u/${me.username}`);
    await expect(friend.page.getByText("Online now")).toBeVisible();
    await friend.page.goto("/friends");
    await expect(friend.page.getByText("Online now")).toBeVisible();
    await friend.page.goto("/messages");
    await expect(friend.page.getByText("Online now")).toBeVisible();

    // a stranger sees the profile but nothing about when you were around
    await stranger.page.goto(`/u/${me.username}`);
    await expect(stranger.page.getByRole("heading", { name: me.displayName })).toBeVisible();
    await expect(stranger.page.getByText(/Online now|Active today|Active this week/)).toHaveCount(0);

    // you don't see it about yourself, but you can switch it off
    await page.goto(`/u/${me.username}`);
    await expect(page.getByText(/Online now/)).toHaveCount(0);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const box = page.getByRole("checkbox", { name: "Show my friends when I'm online" });
    await expect(box).toBeChecked();
    await box.click();
    await expect(box).not.toBeChecked();
    await expect.poll(async () => (await page.request.get(`/api/profiles/${me.username}`).then((r) => r.json())).user.showActivity).toBe(false);

    await friend.page.goto(`/u/${me.username}`);
    await expect(friend.page.getByRole("heading", { name: me.displayName })).toBeVisible();
    await expect(friend.page.getByText(/Online now|Active today|Active this week/)).toHaveCount(0);
    await friend.page.goto("/friends");
    await expect(friend.page.getByText(me.displayName)).toBeVisible();
    await expect(friend.page.getByText(/Online now|Active today|Active this week/)).toHaveCount(0);

    // and on again
    await box.click();
    await expect(box).toBeChecked();
    await page.reload(); // checks in again
    await friend.page.goto(`/u/${me.username}`);
    await expect(friend.page.getByText("Online now")).toBeVisible();
    await friend.context.close();
    await stranger.context.close();
  });

  test("the exact time is never sent to anyone", async ({ page, browser, baseURL }) => {
    const me = newUser("secretive");
    await signUpViaUi(page, me);
    const friend = await secondBrowserUser(browser, baseURL!, "friendly");
    await befriend(page.request, friend.context.request, me.username);
    const profile = await friend.context.request.get(`/api/profiles/${me.username}`);
    const text = await profile.text();
    expect(text).toContain('"activity":"online"');
    expect(text).not.toContain("lastActiveAt");
    expect(text).not.toContain("showActivity");
    await friend.context.close();
  });
});
