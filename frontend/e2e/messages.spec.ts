import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// A message bubble in the open thread (the conversation list also previews the latest text).
const bubble = (page: Page, text: string) => page.locator("div.rounded-2xl", { hasText: text });

test.describe("direct messages", () => {
  test("a friend's message shows up unread, can be read and answered, and deleted", async ({ page, browser, baseURL }) => {
    const me = newUser("reader");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "writer");
    await befriend(page.request, friend.request, me.username);

    // They write first, so the conversation arrives with an unread count.
    expect((await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Free for a studio session Friday?" } })).status()).toBe(201);

    await page.goto("/messages");
    const row = page.getByRole("link", { name: new RegExp(friend.user.displayName) });
    await expect(row).toContainText("Free for a studio session Friday?");
    await expect(row.getByLabel("1 unread")).toBeVisible();

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/messages/${friend.user.username}$`));
    await expect(bubble(page, "Free for a studio session Friday?")).toBeVisible();
    // opening the thread marked it read
    await expect.poll(async () => (await (await page.request.get("/api/messages/unread-count")).json()).unread).toBe(0);

    // Reply through the UI.
    const box = page.getByLabel("Message", { exact: true });
    await box.fill("Yes! 3pm works.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // the box empties once the server has accepted it (until then the text is still in the box)
    await expect(box).toHaveValue("");
    await expect(bubble(page, "Yes! 3pm works.")).toBeVisible();
    const theirView = await (await friend.request.get(`/api/messages/with/${me.username}`)).json();
    expect(theirView.messages.map((m: { body: string }) => m.body)).toEqual(["Free for a studio session Friday?", "Yes! 3pm works."]);

    // Delete my message: gone for me and for them.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete message" }).click();
    await expect(bubble(page, "Yes! 3pm works.")).toHaveCount(0);
    await expect(page.getByText("You: Yes! 3pm works.")).toHaveCount(0); // and the list preview updates
    const after = await (await friend.request.get(`/api/messages/with/${me.username}`)).json();
    expect(after.messages).toHaveLength(1);
    await friend.context.close();
  });

  test("a new message from a friend appears without reloading the page", async ({ page, browser, baseURL }) => {
    const me = newUser("live");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "sender");
    await befriend(page.request, friend.request, me.username);

    await page.goto(`/messages/${friend.user.username}`);
    await expect(page.getByText(/No messages yet — say hello/)).toBeVisible();
    await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Hello from the other side" } });
    // the open thread polls every few seconds
    await expect(bubble(page, "Hello from the other side")).toBeVisible({ timeout: 20_000 });
    await friend.context.close();
  });

  test("a friend's profile has a Message button that opens the conversation", async ({ page, browser, baseURL }) => {
    const me = newUser("visitor");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "buddy");
    await befriend(page.request, friend.request, me.username);

    await page.goto(`/u/${friend.user.username}`);
    await page.getByRole("link", { name: "Message", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/messages/${friend.user.username}$`));
    await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
    await friend.context.close();
  });

  test("you can't message someone who isn't your friend", async ({ page, browser, baseURL }) => {
    const me = newUser("loner");
    await signUpViaUi(page, me);
    const stranger = await apiUser(browser, baseURL!, "stranger");

    await page.goto(`/u/${stranger.user.username}`);
    await expect(page.getByRole("button", { name: "Add Friend" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Message", exact: true })).toHaveCount(0);

    await page.goto(`/messages/${stranger.user.username}`);
    await expect(page.getByText("You can only message your friends")).toBeVisible();
    // and the API refuses too, both ways
    expect((await page.request.post(`/api/messages/with/${stranger.user.username}`, { data: { body: "hi" } })).status()).toBe(403);
    expect((await stranger.request.post(`/api/messages/with/${me.username}`, { data: { body: "hi" } })).status()).toBe(403);
    await stranger.context.close();
  });
});
