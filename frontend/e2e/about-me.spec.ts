import { expect, test, type Page } from "@playwright/test";
import { befriend, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// The Edit button in the About me heading (the page has other Edit buttons: the picture, the top friends…).
const editAbout = (page: Page) => page.locator("h2", { hasText: "About me" }).locator("xpath=..").getByRole("button", { name: "Edit", exact: true }).click();

test.describe("About me", () => {
  test("the owner fills it in; friends see the place and birthday, strangers only what is public", async ({ page, browser, baseURL }) => {
    const owner = newUser("aboutowner");
    await signUpViaUi(page, owner);
    const friend = await secondBrowserUser(browser, baseURL!, "aboutfriend");
    await befriend(page.request, friend.context.request, owner.username);
    const stranger = await secondBrowserUser(browser, baseURL!, "aboutstranger");

    // empty at first: the owner is invited to write it, and it is the first section under the introduction
    await page.goto(`/u/${owner.username}`);
    await expect(page.getByText(/Tell people about yourself/)).toBeVisible();
    await stranger.page.goto(`/u/${owner.username}`);
    await expect(stranger.page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    await expect(stranger.page.getByRole("heading", { name: "About me" })).toHaveCount(0); // nothing to show yet

    // fill it in
    await editAbout(page);
    await page.getByLabel("Interests").fill("Painting and clay");
    await page.getByLabel("Favourite music").fill("Jazz, mostly");
    await page.getByLabel("Who I'd like to meet").fill("People who make things");
    await page.getByLabel("Location", { exact: true }).fill("Leeds, England");
    await page.getByLabel(/Show my birthday/).check();
    await page.getByLabel("Birthday month").selectOption("3");
    await page.getByLabel("Birthday day").selectOption("4");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Painting and clay")).toBeVisible();
    await expect(page.getByText("📍 Leeds, England")).toBeVisible();
    await expect(page.getByText(/🎂/)).toBeVisible();

    // it was really saved
    await page.reload();
    await expect(page.getByText("Painting and clay")).toBeVisible();
    await expect(page.getByText("Who I'd like to meet")).toBeVisible();

    // the About me section comes before the others
    const aboutBox = await page.getByRole("heading", { name: "About me" }).boundingBox();
    const friendsBox = await page.getByRole("heading", { name: "Top friends" }).boundingBox();
    expect(aboutBox!.y).toBeLessThan(friendsBox!.y);

    // a friend sees everything, including the place and the birthday
    await friend.page.goto(`/u/${owner.username}`);
    await expect(friend.page.getByText("Painting and clay")).toBeVisible();
    await expect(friend.page.getByText("📍 Leeds, England")).toBeVisible();
    await expect(friend.page.getByText(/🎂/)).toBeVisible();

    // a stranger sees the answers, but not the place (friends only) or the birthday
    await stranger.page.reload();
    await expect(stranger.page.getByText("Painting and clay")).toBeVisible();
    await expect(stranger.page.getByText(/📍/)).toHaveCount(0);
    await expect(stranger.page.getByText(/🎂/)).toHaveCount(0);
    const asStranger = await (await stranger.context.request.get(`/api/about/${owner.username}`)).json();
    expect(asStranger.location).toBe("");
    expect(asStranger.birthday).toBeNull();

    // the owner can show the place to everyone, and take the birthday back, which forgets it
    await editAbout(page);
    await page.getByLabel("Who can see your location").selectOption("everyone");
    await page.getByLabel(/Show my birthday/).uncheck();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/🎂/)).toHaveCount(0);
    await stranger.page.reload();
    await expect(stranger.page.getByText("📍 Leeds, England")).toBeVisible();
    await friend.page.reload();
    await expect(friend.page.getByText(/🎂/)).toHaveCount(0);

    await friend.context.close();
    await stranger.context.close();
  });

  test("a private profile's About me isn't shown to strangers", async ({ page, browser, baseURL }) => {
    const owner = newUser("aboutprivate");
    await signUpViaUi(page, owner);
    expect((await page.request.put("/api/about/me", { data: { interests: "Secret hobbies" } })).status()).toBe(200);
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    const stranger = await secondBrowserUser(browser, baseURL!, "aboutnosy");
    expect((await stranger.context.request.get(`/api/about/${owner.username}`)).status()).toBe(403);
    await stranger.context.close();
  });
});
