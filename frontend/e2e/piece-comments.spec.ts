import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// A one-pixel picture, so the test needs no network to show a piece.
const PICTURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test.describe("comments on a portfolio piece", () => {
  test("a visitor comments and changes it; the owner is told, lands on it, and takes it down", async ({ page, browser, baseURL }) => {
    const owner = newUser("painter");
    await signUpViaUi(page, owner);
    const made = await page.request.post("/api/media", { data: { type: "image", url: PICTURE, caption: "Harbour at dawn" } });
    expect(made.status()).toBe(201);

    // a visitor leaves a comment on the piece
    const visitor = await secondBrowserUser(browser, baseURL!, "visitor");
    await visitor.page.goto(`/u/${owner.username}`);
    await expect(visitor.page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    await visitor.page.getByRole("button", { name: "Comments (0)" }).click();
    await visitor.page.getByPlaceholder("Write a comment…").fill("The light here is wonderful");
    await visitor.page.locator("#portfolio").getByRole("button", { name: "Post", exact: true }).click();
    await expect(visitor.page.getByText("The light here is wonderful")).toBeVisible();
    await expect(visitor.page.getByRole("button", { name: "Comments (1)" })).toBeVisible();

    // and still sees it after a reload, and can change it
    await visitor.page.reload();
    await expect(visitor.page.getByRole("button", { name: "Comments (1)" })).toBeVisible();
    await visitor.page.getByRole("button", { name: "Comments (1)" }).click();
    await expect(visitor.page.getByText("The light here is wonderful")).toBeVisible();
    await visitor.page.getByRole("button", { name: /^Edit your comment/ }).click();
    await visitor.page.getByLabel("Edit comment").fill("The light here is wonderful, truly");
    await visitor.page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(visitor.page.getByText("The light here is wonderful, truly")).toBeVisible();
    await expect(visitor.page.getByText("(edited)")).toBeVisible();

    // the owner is told, and the notification opens the piece with the comment marked
    await page.goto("/");
    await page.getByRole("button", { name: "Notifications" }).click();
    await page.getByText(/commented on your portfolio/).click();
    await expect(page).toHaveURL(new RegExp(`/u/${owner.username}\\?piece=[a-f0-9]+&comment=[a-f0-9]+#portfolio`));
    const text = page.getByText("The light here is wonderful, truly");
    await expect(text).toBeVisible();
    await expect(page.locator("[aria-current='true']")).toContainText("wonderful, truly");

    // the owner may take down a comment on their own piece
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^Delete comment by/ }).click();
    await expect(text).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comments (0)" })).toBeVisible();
    await visitor.page.reload();
    await expect(visitor.page.getByRole("button", { name: "Comments (0)" })).toBeVisible();
    await visitor.context.close();
  });

  test("a private profile's pieces can't be commented on by strangers", async ({ page, browser, baseURL }) => {
    const owner = newUser("private");
    await signUpViaUi(page, owner);
    const made = await page.request.post("/api/media", { data: { type: "image", url: PICTURE } });
    const piece = (await made.json()).mediaItem.id as string;
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);

    const stranger = await secondBrowserUser(browser, baseURL!, "stranger");
    expect((await stranger.context.request.get(`/api/media/${piece}/comments`)).status()).toBe(404);
    expect((await stranger.context.request.post(`/api/media/${piece}/comments`, { data: { content: "let me in" } })).status()).toBe(404);
    await stranger.context.close();
  });
});
