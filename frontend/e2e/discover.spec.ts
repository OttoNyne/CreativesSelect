import { expect, test } from "@playwright/test";
import { apiUser, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// the shared e2e database holds everyone from every project, so each run uses a tag of its own
const uniqTag = () => `tag${Math.random().toString(36).slice(2, 8)}`;

test.describe("mood, listening to and tags", () => {
  test("an owner sets them, they show on the profile, and the tag leads to others who share it", async ({ page, browser, baseURL }) => {
    const me = newUser("maker");
    await signUpViaUi(page, me);
    const tag = uniqTag();

    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByLabel("Mood").fill("feeling creative");
    await page.getByLabel("Listening to").fill("Kind of Blue");
    const tagBox = page.getByLabel(/What do you do/);
    await tagBox.fill(tag);
    await tagBox.press("Enter");
    await expect(page.getByRole("list", { name: "Your tags" })).toContainText(`#${tag}`);
    // wait for the save to be answered before leaving edit mode (leaving at once raced the save on a slow machine)
    const saved = page.waitForResponse((r) => r.url().includes("/api/profiles/me") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save changes" }).click();
    expect((await saved).status()).toBe(200);

    await page.getByRole("button", { name: "Done editing" }).click();
    await expect(page.getByText("feeling creative")).toBeVisible();
    await expect(page.getByText("Kind of Blue")).toBeVisible();
    const chip = page.getByRole("link", { name: `Find others tagged ${tag}` });
    await expect(chip).toBeVisible();

    // somebody else with the same tag, then a visitor follows the chip
    const other = await apiUser(browser, baseURL!, "alike");
    expect((await other.request.patch("/api/profiles/me", { data: { tags: [tag], mood: "curious" } })).status()).toBe(200);

    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/search\\?tag=${tag}`));
    const list = page.getByRole("region", { name: `Creatives tagged ${tag}` });
    // you are never listed to yourself
    await expect(list.getByRole("link", { name: new RegExp(other.user.displayName) })).toBeVisible();
    await expect(list.getByRole("link", { name: new RegExp(me.displayName) })).toHaveCount(0);
    await expect(list.getByText("curious")).toBeVisible();

    await page.getByRole("button", { name: "Show everyone" }).click();
    await expect(page.getByRole("region", { name: "New creatives" })).toBeVisible();
  });

  test("a tag can be picked on the discover page, and a private profile is never listed", async ({ page, browser, baseURL }) => {
    const me = newUser("seeker");
    await signUpViaUi(page, me);
    const tag = uniqTag();
    const open = await apiUser(browser, baseURL!, "openly");
    const hidden = await apiUser(browser, baseURL!, "hidden");
    expect((await open.request.patch("/api/profiles/me", { data: { tags: [tag] } })).status()).toBe(200);
    expect((await hidden.request.patch("/api/profiles/me", { data: { tags: [tag], isPrivate: true } })).status()).toBe(200);

    // a visitor on a public profile follows its tag; the private person with the same tag is never listed
    // (the popular-tags list is only the 24 most used, so it can't be relied on in a database shared with other tests)
    const second = await apiUser(browser, baseURL!, "second");
    expect((await second.request.patch("/api/profiles/me", { data: { tags: [tag] } })).status()).toBe(200);
    await page.goto(`/u/${open.user.username}`);
    await page.getByRole("link", { name: `Find others tagged ${tag}` }).click();
    const list = page.getByRole("region", { name: `Creatives tagged ${tag}` });
    await expect(list.getByRole("link", { name: new RegExp(second.user.displayName) })).toBeVisible();
    await expect(list.getByRole("link", { name: new RegExp(open.user.displayName) })).toBeVisible();
    await expect(list.getByRole("link", { name: new RegExp(hidden.user.displayName) })).toHaveCount(0);
    await expect(list.getByRole("link", { name: new RegExp(me.displayName) })).toHaveCount(0);
  });

  test("a bad mood or tag is refused, with the reason", async ({ page }) => {
    const me = newUser("careful");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByLabel(/What do you do/).fill("x");
    await expect(page.getByRole("alert")).toContainText(/Use 2–24/);
    await expect(page.getByRole("button", { name: "Add tag" })).toBeDisabled();
  });
});
