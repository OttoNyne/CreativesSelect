import { expect, test } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const uniq = (title: string) => `${title} ${Math.random().toString(36).slice(2, 7)}`;

test.describe("blog entries", () => {
  test("an author writes one, a friend is told and reads it, the author changes it and then deletes it", async ({ page, browser, baseURL }) => {
    const me = newUser("writer");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "reader");
    await befriend(page.request, friend.request, me.username);

    // write
    const title = uniq("A day in the studio");
    await page.goto(`/u/${me.username}`);
    await page.getByRole("link", { name: "Write an entry" }).click();
    await page.getByLabel("Entry title").fill(title);
    await page.getByLabel("Entry text").fill("First paragraph.\n\nSecond <b>paragraph</b> & more.");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("First paragraph.")).toBeVisible();
    await expect(page.getByText("Second <b>paragraph</b> & more.")).toBeVisible(); // shown as typed, not as markup
    const entryUrl = page.url();

    // it is on the profile, with the start of the text
    await page.goto(`/u/${me.username}`);
    const mine = page.getByRole("region", { name: "Blog" }).getByRole("link", { name: new RegExp(title) });
    await expect(mine).toContainText("First paragraph.");

    // the friend hears about it, opens it from the notification and can report but not change it
    const fan = await friend.context.newPage();
    await fan.goto("/");
    await fan.getByRole("button", { name: "Notifications" }).click();
    await fan.getByText(new RegExp(`wrote a blog entry: "${title}"`)).click();
    await expect(fan).toHaveURL(/\/blog\/[0-9a-f]{24}$/);
    await expect(fan.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(fan.getByRole("button", { name: "Report" })).toBeVisible();
    await expect(fan.getByRole("link", { name: "Edit entry" })).toHaveCount(0);
    // and sees it in the author's blog
    await fan.goto(`/u/${me.username}`);
    await expect(fan.getByRole("region", { name: "Blog" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await expect(fan.getByRole("link", { name: "Write an entry" })).toHaveCount(0);

    // change it
    await page.goto(entryUrl);
    await page.getByRole("link", { name: "Edit entry" }).click();
    const newTitle = `${title} (revised)`;
    await page.getByLabel("Entry title").fill(newTitle);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: newTitle })).toBeVisible();
    await fan.goto(entryUrl);
    await expect(fan.getByRole("heading", { level: 1, name: newTitle })).toBeVisible();

    // delete it: it is gone from the profile, the page, and the friend's notifications
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete entry" }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${me.username}`));
    await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
    await fan.goto(entryUrl);
    await expect(fan.getByRole("alert")).toContainText("This entry isn't available");
    await fan.goto("/");
    await fan.getByRole("button", { name: "Notifications" }).click();
    await expect(fan.getByText(new RegExp(`wrote a blog entry: "${title}"`))).toHaveCount(0);
    await friend.context.close();
  });

  test("an entry needs a title and some text, and says so", async ({ page }) => {
    await signUpViaUi(page, newUser("blank"));
    await page.goto("/blog/new");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("alert")).toContainText("Give your entry a title");
    await page.getByLabel("Entry title").fill("Only a title");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("alert")).toContainText("Write something in your entry");
  });

  test("a private profile's entries can't be read by a stranger, and nobody else can change them", async ({ page, browser, baseURL }) => {
    const me = newUser("secret");
    await signUpViaUi(page, me);
    const made = await page.request.post("/api/blog", { data: { title: uniq("Private thoughts"), body: "Not for everyone" } });
    expect(made.status()).toBe(201);
    const { entry } = await made.json();
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);

    const stranger = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const other = await stranger.newPage();
    await signUpViaUi(other, newUser("nosy"));
    await other.goto(`/blog/${entry.id}`);
    await expect(other.getByRole("alert")).toContainText("This entry isn't available");
    await other.goto(`/blog/${entry.id}/edit`);
    await expect(other.getByRole("alert")).toContainText("isn't available to change");
    expect((await other.request.put(`/api/blog/${entry.id}`, { data: { title: "Hijacked" } })).status()).toBe(404);
    expect((await other.request.delete(`/api/blog/${entry.id}`)).status()).toBe(404);
    await stranger.close();

    // the author still can
    await page.goto(`/blog/${entry.id}`);
    await expect(page.getByRole("link", { name: "Edit entry" })).toBeVisible();
  });
});
