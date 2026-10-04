import { expect, test } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const uniq = (title: string) => `${title} ${Math.random().toString(36).slice(2, 7)}`;

test.describe("bulletins", () => {
  test("a bulletin reaches friends only, the badge clears once they look, and the author can take it down", async ({ page, browser, baseURL }) => {
    const me = newUser("poster");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "pal");
    const stranger = await apiUser(browser, baseURL!, "outsider");
    await befriend(page.request, friend.request, me.username);

    // post one from the board
    const title = uniq("Show on Friday");
    await page.goto("/");
    await page.getByRole("link", { name: /Bulletins/ }).click();
    await expect(page).toHaveURL(/\/bulletins$/);
    await page.getByLabel("Bulletin title").fill(title);
    await page.getByLabel("Bulletin text").fill("Come along!\n\nDoors at 7 <b>sharp</b>.");
    await page.getByRole("button", { name: "Post bulletin" }).click();
    const mine = page.getByRole("article").filter({ hasText: title });
    await expect(mine).toBeVisible();
    await expect(mine).toContainText("You");
    await expect(mine).toContainText("Doors at 7 <b>sharp</b>."); // shown as typed
    await expect(mine).toContainText("10 days left");
    await expect(page.getByLabel("Bulletin title")).toHaveValue("");

    // the friend sees a badge on the feed, then the bulletin, and the badge goes
    const pal = await friend.context.newPage();
    await pal.goto("/");
    await expect(pal.getByLabel("1 new")).toBeVisible();
    await pal.getByRole("link", { name: /Bulletins/ }).click();
    const theirs = pal.getByRole("article").filter({ hasText: title });
    await expect(theirs).toBeVisible();
    await expect(theirs).toContainText(me.displayName);
    await expect(theirs.getByRole("button", { name: `Report ${title}` })).toBeVisible();
    await expect(theirs.getByRole("button", { name: /Take down/ })).toHaveCount(0);
    await pal.goto("/");
    await expect(pal.getByRole("link", { name: /Bulletins/ })).toBeVisible();
    await expect(pal.getByLabel(/new$/)).toHaveCount(0);

    // someone who isn't a friend sees nothing
    const outsider = await stranger.context.newPage();
    await outsider.goto("/bulletins");
    await expect(outsider.getByText("No bulletins yet")).toBeVisible();
    await expect(outsider.getByRole("article")).toHaveCount(0);

    // taking it down removes it for the friend too
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: `Take down ${title}` }).click();
    await expect(mine).toHaveCount(0);
    await pal.goto("/bulletins");
    await expect(pal.getByRole("article").filter({ hasText: title })).toHaveCount(0);
    await friend.context.close();
    await stranger.context.close();
  });

  test("a bulletin needs a title and some text, and says so", async ({ page }) => {
    await signUpViaUi(page, newUser("terse"));
    await page.goto("/bulletins");
    await page.getByRole("button", { name: "Post bulletin" }).click();
    await expect(page.getByRole("alert")).toContainText("Give your bulletin a title");
    await page.getByLabel("Bulletin title").fill("Only a title");
    await page.getByRole("button", { name: "Post bulletin" }).click();
    await expect(page.getByRole("alert")).toContainText("Write something in your bulletin");
  });

  test("only the author can take one down, and an over-long one is refused", async ({ page, browser, baseURL }) => {
    const me = newUser("owner");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "peer");
    await befriend(page.request, friend.request, me.username);
    const made = await page.request.post("/api/bulletins", { data: { title: uniq("Keep me"), body: "Stay up" } });
    expect(made.status()).toBe(201);
    const { bulletin } = await made.json();
    expect((await friend.request.delete(`/api/bulletins/${bulletin.id}`)).status()).toBe(404);
    expect((await page.request.post("/api/bulletins", { data: { title: "Long", body: "x".repeat(501) } })).status()).toBe(400);
    await page.goto("/bulletins");
    await expect(page.getByRole("article").filter({ hasText: bulletin.title })).toBeVisible();
    await friend.context.close();
  });
});
