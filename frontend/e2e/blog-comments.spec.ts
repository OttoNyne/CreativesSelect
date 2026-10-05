import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

test.describe("comments on a blog entry", () => {
  test("a reader comments, the author is told, lands on it, and takes it down", async ({ page, browser, baseURL }) => {
    const author = newUser("blogger");
    await signUpViaUi(page, author);
    const made = await page.request.post("/api/blog", { data: { title: "A day in the studio", body: "First paragraph.\n\nSecond paragraph." } });
    expect(made.status()).toBe(201);
    const entryId = (await made.json()).entry.id as string;

    // a reader leaves a comment with a link, and can change it
    const reader = await secondBrowserUser(browser, baseURL!, "reader");
    await reader.page.goto(`/blog/${entryId}`);
    await expect(reader.page.getByRole("heading", { name: "A day in the studio" })).toBeVisible();
    await expect(reader.page.getByRole("heading", { name: /Comments/ })).toContainText("(0)");
    await reader.page.getByPlaceholder("Write a comment…").fill("Lovely, more like it: https://example.com/more");
    await reader.page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(reader.page.getByRole("link", { name: "example.com/more" })).toBeVisible();
    await expect(reader.page.getByRole("heading", { name: /Comments/ })).toContainText("(1)");
    await reader.page.getByRole("button", { name: /^Edit your comment/ }).click();
    await reader.page.getByLabel("Edit comment").fill("Lovely, more please");
    await reader.page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(reader.page.getByText("Lovely, more please")).toBeVisible();
    await expect(reader.page.getByText("(edited)")).toBeVisible();

    // the author is told, and the notification opens the entry with the comment marked
    await page.goto("/");
    await page.getByRole("button", { name: "Notifications" }).click();
    await page.getByText(/commented on your blog entry/).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${entryId}\\?comment=[a-f0-9]+$`));
    await expect(page.locator("[aria-current='true']")).toContainText("Lovely, more please");

    // the author may take a comment on their own entry down
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^Delete comment by/ }).click();
    await expect(page.getByText("Lovely, more please")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Comments/ })).toContainText("(0)");
    await reader.context.close();
  });

  test("a private profile's entries can't be commented on by strangers", async ({ page, browser, baseURL }) => {
    const author = newUser("blogprivate");
    await signUpViaUi(page, author);
    const made = await page.request.post("/api/blog", { data: { title: "Private thoughts", body: "Words." } });
    const entryId = (await made.json()).entry.id as string;
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    const stranger = await secondBrowserUser(browser, baseURL!, "blognosy");
    expect((await stranger.context.request.get(`/api/blog/${entryId}/comments`)).status()).toBe(404);
    expect((await stranger.context.request.post(`/api/blog/${entryId}/comments`, { data: { content: "let me in" } })).status()).toBe(404);
    await stranger.context.close();
  });
});
