import { expect, test, type Browser, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

/** Someone who is not signed in opens a link, in a browser of their own. */
async function visitor(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
  return { context, page: await context.newPage() };
}
async function signUpHere(page: Page, user: ReturnType<typeof newUser>) {
  await page.getByPlaceholder("Display name").fill(user.displayName);
  await page.getByPlaceholder("Username").fill(user.username);
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password (min 8 characters)").fill(user.password);
  await page.getByRole("checkbox", { name: /I'm at least 13/ }).check();
  await page.getByRole("button", { name: "Sign up" }).click();
}

test.describe("invite links", () => {
  test("a link makes the newcomer your friend straight away, you see them join, and switching it off stops new people", async ({ page, browser, baseURL }) => {
    const me = newUser("inviter");
    await signUpViaUi(page, me);

    // make a link on the Friends page
    await page.goto("/friends");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const link = page.getByLabel("Invite link");
    const url = await link.inputValue();
    expect(url).toMatch(/\/join\/[A-Za-z0-9_-]{16}$/);
    await expect(page.getByText(/0 of 10 used/)).toBeVisible();
    await page.getByRole("button", { name: "Share or show QR code" }).click();
    await expect(page.getByRole("dialog")).toBeVisible(); // the same QR / share window as elsewhere
    await page.keyboard.press("Escape");

    // someone opens it: they see who invited them, sign up, and land with their new friend
    const guest = await visitor(browser, baseURL!);
    await guest.page.goto(new URL(url).pathname);
    await expect(guest.page.getByText(new RegExp(`${me.displayName} invited you`))).toBeVisible();
    const newcomer = newUser("newcomer");
    await signUpHere(guest.page, newcomer);
    await expect(guest.page).toHaveURL(/\/friends$/);
    await expect(guest.page.getByRole("link", { name: me.displayName })).toBeVisible();

    // the inviter is told, sees them in their friends and in the link's list, and the count moves
    await page.goto("/friends");
    await expect(page.getByRole("link", { name: newcomer.displayName }).first()).toBeVisible();
    await expect(page.getByText(/1 of 10 used/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Joined with this link" })).toContainText(newcomer.displayName);
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText(/joined with your invite link/)).toBeVisible();
    await page.keyboard.press("Escape");

    // switch it off: the next person is told it isn't valid, can still sign up, but is not a friend
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Switch off" }).click();
    await expect(page.getByLabel("Invite link")).toHaveCount(0);
    const late = await visitor(browser, baseURL!);
    await late.page.goto(new URL(url).pathname);
    await expect(late.page.getByText(/isn't valid any more/)).toBeVisible();
    const latecomer = newUser("latecomer");
    await signUpHere(late.page, latecomer);
    await expect(late.page).toHaveURL(/\/$/);
    await page.goto("/friends");
    await expect(page.getByRole("link", { name: latecomer.displayName })).toHaveCount(0);
    await expect(page.getByRole("link", { name: newcomer.displayName }).first()).toBeVisible(); // the first one stays a friend
    await guest.context.close();
    await late.context.close();
  });

  test("a made-up link, and one for someone's private profile, behave properly", async ({ page, browser, baseURL }) => {
    const me = newUser("quiet");
    await signUpViaUi(page, me);
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    const made = await page.request.post("/api/invites");
    expect(made.status()).toBe(201);
    const code = (await made.json()).invite.code as string;

    const fake = await visitor(browser, baseURL!);
    await fake.page.goto("/join/aaaaaaaaaaaaaaaa");
    await expect(fake.page.getByText(/isn't valid any more/)).toBeVisible();
    await fake.context.close();

    // someone who comes in through a private person's link can see their profile, as any friend can
    const guest = await visitor(browser, baseURL!);
    await guest.page.goto(`/join/${code}`);
    const person = newUser("trusted");
    await signUpHere(guest.page, person);
    await expect(guest.page).toHaveURL(/\/friends$/);
    await guest.page.goto(`/u/${me.username}`);
    await expect(guest.page.getByRole("heading", { name: me.displayName })).toBeVisible();
    await guest.context.close();
  });

  test("only three links at once, and the preview says nothing but a name and a picture", async ({ page, request }) => {
    await signUpViaUi(page, newUser("maker"));
    const codes: string[] = [];
    for (let i = 0; i < 3; i++) codes.push((await (await page.request.post("/api/invites")).json()).invite.code);
    expect((await page.request.post("/api/invites")).status()).toBe(400);
    const preview = await request.get(`/api/invites/preview/${codes[0]}`);
    expect(preview.status()).toBe(200);
    const body = await preview.json();
    expect(Object.keys(body.inviter).sort()).toEqual(["avatarUrl", "displayName", "username"]);
  });
});
