import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const visitors = (page: Page) => page.getByRole("region", { name: "Recent visitors" });
/** Switch profile views on or off from the edit panel, as a person would. */
async function setProfileViews(page: Page, username: string, on: boolean) {
  await page.goto(`/u/${username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  const box = page.getByRole("checkbox", { name: "Profile views" });
  if ((await box.isChecked()) !== on) await box.click();
  if (on) await expect(box).toBeChecked();
  else await expect(box).not.toBeChecked();
  await expect.poll(async () => (await page.request.get(`/api/profiles/${username}`).then((r) => r.json())).user.profileViews).toBe(on);
}

test.describe("profile views, only when both people opt in", () => {
  test("two people who both turn it on see each other's visits, and turning it off forgets them", async ({ page, browser, baseURL }) => {
    const me = newUser("looked");
    await signUpViaUi(page, me);
    const visitor = await secondBrowserUser(browser, baseURL!, "visitor");

    // off by default: no visitors card, no way to see the list
    await page.goto(`/u/${me.username}`);
    await expect(visitors(page)).toHaveCount(0);
    expect((await page.request.get("/api/profile-views")).status()).toBe(403);

    await setProfileViews(page, me.username, true);
    await setProfileViews(visitor.page, visitor.user.username, true);

    await visitor.page.goto(`/u/${me.username}`);
    await expect(visitor.page.getByRole("heading", { name: me.displayName })).toBeVisible();

    await page.goto(`/u/${me.username}`);
    await expect(visitors(page)).toBeVisible();
    const row = visitors(page).getByRole("listitem").filter({ hasText: visitor.user.displayName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Visited [A-Z][a-z]+ \d{1,2}, \d{4}/); // a day, never a time
    await expect(row).not.toContainText(/\d{1,2}:\d{2}/);

    // the visitor doesn't see anything about being seen, only their own switch
    await expect(visitor.page.getByText("Recent visitors")).toHaveCount(0);

    // turning it off removes the card and every visit; turning it on again starts from nothing
    await setProfileViews(page, me.username, false);
    await expect(visitors(page)).toHaveCount(0);
    expect((await page.request.get("/api/profile-views")).status()).toBe(403);
    await setProfileViews(page, me.username, true);
    await page.goto(`/u/${me.username}`);
    await expect(visitors(page)).toContainText("No visitors to show yet.");
    await visitor.context.close();
  });

  test("a visit is not recorded or shown when either person hasn't opted in", async ({ page, browser, baseURL }) => {
    const me = newUser("watched");
    await signUpViaUi(page, me);
    const shy = await secondBrowserUser(browser, baseURL!, "shy");
    const open = await secondBrowserUser(browser, baseURL!, "open");
    const quiet = await secondBrowserUser(browser, baseURL!, "quiet");

    // me: on. shy: off (so their visit isn't recorded). open: on, and visits a person who has it off (quiet).
    expect((await page.request.patch("/api/profiles/me", { data: { profileViews: true } })).status()).toBe(200);
    expect((await open.context.request.patch("/api/profiles/me", { data: { profileViews: true } })).status()).toBe(200);

    await shy.page.goto(`/u/${me.username}`);
    await expect(shy.page.getByRole("heading", { name: me.displayName })).toBeVisible();
    await open.page.goto(`/u/${quiet.user.username}`); // quiet hasn't opted in: nothing is recorded about this visit
    await expect(open.page.getByRole("heading", { name: quiet.user.displayName })).toBeVisible();
    await open.page.goto(`/u/${me.username}`);
    await expect(open.page.getByRole("heading", { name: me.displayName })).toBeVisible();

    await page.goto(`/u/${me.username}`);
    await expect(visitors(page).getByRole("listitem")).toHaveCount(1);
    await expect(visitors(page)).toContainText(open.user.displayName);
    await expect(visitors(page)).not.toContainText(shy.user.displayName);

    // quiet turns it on later: they must not find a visit from before they agreed
    expect((await quiet.context.request.patch("/api/profiles/me", { data: { profileViews: true } })).status()).toBe(200);
    const list = await quiet.context.request.get("/api/profile-views");
    expect((await list.json()).visitors).toEqual([]);
    for (const x of [shy, open, quiet]) await x.context.close();
  });

  test("a bad value for the switch is refused, and nobody can read someone else's list", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("careful"));
    expect((await page.request.patch("/api/profiles/me", { data: { profileViews: "yes" } })).status()).toBe(400);
    const other = await secondBrowserUser(browser, baseURL!, "snoop");
    expect((await other.context.request.get("/api/profile-views")).status()).toBe(403); // theirs, and theirs is off
    await other.context.close();
  });
});
