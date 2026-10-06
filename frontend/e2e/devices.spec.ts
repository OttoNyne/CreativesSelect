import { expect, test, type Browser, type Page } from "@playwright/test";
import { fakeIpHeaders, logInViaUi, newUser, signUpViaUi, type TestUser } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

/** The same person signed in on a second device (a browser of its own, saying it is a phone). */
async function secondDevice(browser: Browser, baseURL: string, user: TestUser) {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: fakeIpHeaders(),
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await logInViaUi(page, user);
  await expect(page).toHaveURL("/");
  return { context, page };
}

async function openList(page: Page, username: string) {
  await page.goto(`/u/${username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: /Where you.re signed in/ }).click();
  return page.getByRole("region", { name: "Where you're signed in" });
}

const stillSignedIn = async (page: Page) => (await page.request.get("/api/auth/me")).status() === 200;

test.describe("where you're signed in", () => {
  test("the owner sees each device, signs one out, and that device is signed out at once", async ({ page, browser, baseURL }) => {
    const me = newUser("devices");
    await signUpViaUi(page, me);
    const phone = await secondDevice(browser, baseURL!, me);

    const panel = await openList(page, me.username);
    const items = panel.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("This device");
    await expect(items.nth(1)).toContainText("Safari on iPhone");
    await expect(items.nth(1)).toContainText(/Last used/);
    expect(await stillSignedIn(phone.page)).toBe(true);

    await panel.getByRole("button", { name: /Sign out Safari on iPhone/ }).click();
    await expect(panel.getByText("Safari on iPhone was signed out.")).toBeVisible();
    await expect(items).toHaveCount(1);

    // the phone's next request is refused, and its page sends it to log in
    expect(await stillSignedIn(phone.page)).toBe(false);
    await phone.page.goto(`/u/${me.username}`);
    await expect(phone.page.getByRole("button", { name: "Edit profile" })).toHaveCount(0);
    // while this one carries on
    expect(await stillSignedIn(page)).toBe(true);
    await phone.context.close();
  });

  test("signing out all the other devices ends them together and keeps this one", async ({ page, browser, baseURL }) => {
    const me = newUser("alldevices");
    await signUpViaUi(page, me);
    const a = await secondDevice(browser, baseURL!, me);
    const b = await secondDevice(browser, baseURL!, me);

    const panel = await openList(page, me.username);
    await expect(panel.getByRole("listitem")).toHaveCount(3);
    await panel.getByRole("button", { name: "Sign out all 2 other devices" }).click();
    await expect(panel.getByText("Signed out 2 other devices.")).toBeVisible();
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByText(/this device only/)).toBeVisible();

    expect(await stillSignedIn(a.page)).toBe(false);
    expect(await stillSignedIn(b.page)).toBe(false);
    expect(await stillSignedIn(page)).toBe(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();
    await a.context.close();
    await b.context.close();
  });

  test("a device that logs out disappears from the list, and its old cookie is dead", async ({ page, browser, baseURL }) => {
    const me = newUser("logoutlist");
    await signUpViaUi(page, me);
    const phone = await secondDevice(browser, baseURL!, me);
    const cookie = (await phone.context.cookies()).find((c) => c.name === "token")!;
    expect((await page.request.get("/api/auth/sessions")).status()).toBe(200);
    expect((await (await page.request.get("/api/auth/sessions")).json()).sessions).toHaveLength(2);

    expect((await phone.page.request.post("/api/auth/logout")).status()).toBe(204);
    expect((await (await page.request.get("/api/auth/sessions")).json()).sessions).toHaveLength(1);
    // someone who had copied the cookie before the log out gets nothing
    const copy = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    await copy.addCookies([{ ...cookie, value: cookie.value }]);
    expect((await copy.request.get("/api/auth/me")).status()).toBe(401);
    await copy.close();
    await phone.context.close();
  });

  test("it is only the owner's own list: another person's sign-in can't be reached, and nothing is shown to a signed-out visitor", async ({ page, browser, baseURL }) => {
    const me = newUser("ownlist");
    await signUpViaUi(page, me);
    const other = newUser("otherlist");
    const otherPage = await (await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() })).newPage();
    await signUpViaUi(otherPage, other);
    const theirs = (await (await otherPage.request.get("/api/auth/sessions")).json()).sessions[0].id as string;

    const refused = await page.request.delete(`/api/auth/sessions/${theirs}`);
    expect(refused.status()).toBe(404);
    expect(await stillSignedIn(otherPage)).toBe(true);
    expect((await page.request.delete("/api/auth/sessions/not-an-id")).status()).toBe(404);

    const anon = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    expect((await anon.request.get("/api/auth/sessions")).status()).toBe(401);
    expect((await anon.request.post("/api/auth/sessions/end-others")).status()).toBe(401);
    await anon.close();
    // the public profile carries none of it
    expect(JSON.stringify(await (await page.request.get(`/api/profiles/${me.username}`)).json())).not.toMatch(/sessionsRevokedAt|lastSeenAt/);
  });

  test("changing the password signs the other devices out and the list shows only this one", async ({ page, browser, baseURL }) => {
    const me = newUser("pwlist");
    await signUpViaUi(page, me);
    const phone = await secondDevice(browser, baseURL!, me);
    const changed = await page.request.put("/api/auth/password", { data: { currentPassword: me.password, newPassword: "E2e-password-2-new" } });
    expect(changed.status()).toBe(204);
    expect(await stillSignedIn(phone.page)).toBe(false);
    const panel = await openList(page, me.username);
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByRole("listitem")).toContainText("This device");
    await phone.context.close();
  });
});
