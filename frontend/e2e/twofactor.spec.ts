import { expect, test, type Page } from "@playwright/test";
import { codeAt, fakeIpHeaders, logInViaUi, logOut, newUser, signUpViaUi, type TestUser } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

/** Turns it on through the settings, as a person would. Returns the key (as the app would hold it) and the recovery codes shown. */
async function turnOnViaUi(page: Page, me: TestUser) {
  await page.goto(`/u/${me.username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: /Two-step sign-in…/ }).click();
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await page.getByLabel("Your password").fill(me.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = ((await page.getByLabel("Setup key").textContent()) ?? "").replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expect(page.getByAltText("QR code to scan with your authenticator app")).toBeVisible();
  await page.getByLabel("6-digit code").fill(codeAt(secret));
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  const list = page.getByRole("list", { name: "Recovery codes" });
  await expect(list).toBeVisible();
  const codes = await list.getByRole("listitem").allTextContents();
  expect(codes).toHaveLength(8);
  await page.getByLabel(/I've saved these codes/).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("You have 8 recovery codes left.")).toBeVisible();
  return { secret, codes };
}

async function passwordStep(page: Page, me: TestUser) {
  await logInViaUi(page, me);
  await expect(page.getByRole("heading", { name: "Two-step sign-in" })).toBeVisible();
}

const signedIn = async (page: Page) => (await page.request.get("/api/auth/me")).status() === 200;

test.describe("two-step sign-in", () => {
  test("an owner turns it on with an app, and from then on logging in needs a code as well as the password", async ({ page }) => {
    const me = newUser("twostep");
    await signUpViaUi(page, me);
    const { secret } = await turnOnViaUi(page, me);
    await logOut(page);

    await passwordStep(page, me);
    expect(await signedIn(page)).toBe(false); // the password alone has not signed anyone in
    // the next step's code: the app's first code was for the current step, and each can be used once
    await page.getByLabel("Code from your app").fill(codeAt(secret, 30));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("/");
    expect(await signedIn(page)).toBe(true);
  });

  test("a wrong code is refused and signs no one in; the right one then works", async ({ page }) => {
    const me = newUser("wrongcode");
    await signUpViaUi(page, me);
    const { secret } = await turnOnViaUi(page, me);
    await logOut(page);

    await passwordStep(page, me);
    const right = codeAt(secret, 30);
    await page.getByLabel("Code from your app").fill(right === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toContainText("That code didn't work");
    expect(await signedIn(page)).toBe(false);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Code from your app").fill(right);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("/");
  });

  test("a recovery code gets in once, and the same one doesn't work again", async ({ page }) => {
    const me = newUser("recover");
    await signUpViaUi(page, me);
    const { codes } = await turnOnViaUi(page, me);
    await logOut(page);

    await passwordStep(page, me);
    await page.getByLabel("Code from your app").fill(codes[0].toUpperCase().replace("-", " ")); // typed carelessly
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("/");
    await logOut(page);

    await passwordStep(page, me);
    await page.getByLabel("Code from your app").fill(codes[0]);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toContainText("That code didn't work");
    expect(await signedIn(page)).toBe(false);
    // another one still works, and the owner is told how few are left
    await page.getByLabel("Code from your app").fill(codes[1]);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("/");
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: /Two-step sign-in…/ }).click();
    await expect(page.getByText("You have 6 recovery codes left.")).toBeVisible();
  });

  test("turning it off needs the password and a code, and logging in is then as before", async ({ page }) => {
    const me = newUser("turnoff");
    await signUpViaUi(page, me);
    const { codes } = await turnOnViaUi(page, me);

    await page.getByRole("button", { name: "Turn off" }).first().click();
    await page.getByLabel("Your password").fill(me.password);
    await page.getByLabel("Code from your app").fill(codes[2]);
    await page.getByRole("button", { name: "Turn off" }).last().click();
    await expect(page.getByRole("button", { name: "Turn on two-step sign-in" })).toBeVisible();
    await logOut(page);

    await logInViaUi(page, me);
    await expect(page).toHaveURL("/");
  });

  test("the server holds back the sign-in until the code is given, and gives away nothing to a wrong password", async ({ page, playwright, baseURL }) => {
    const me = newUser("apitwo");
    await signUpViaUi(page, me);
    await turnOnViaUi(page, me);

    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const right = await anon.post("/api/auth/login", { data: { email: me.email, password: me.password } });
    expect(right.status()).toBe(200);
    const body = await right.json();
    expect(body.twoFactorRequired).toBe(true);
    expect(body.user).toBeUndefined();
    expect(right.headers()["set-cookie"]).toBeUndefined();
    expect((await anon.get("/api/auth/me")).status()).toBe(401);
    // the note is not a sign-in
    const sneaky = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { ...fakeIpHeaders(), cookie: `token=${body.challenge}` } });
    expect((await sneaky.get("/api/auth/me")).status()).toBe(401);
    // a wrong password looks the same whether or not it is on
    const wrong = await anon.post("/api/auth/login", { data: { email: me.email, password: "Wrong-password-9" } });
    expect(wrong.status()).toBe(401);
    expect((await wrong.json()).challenge).toBeUndefined();
    // and none of it is in the profile
    const profile = JSON.stringify(await (await anon.get(`/api/profiles/${me.username}`)).json());
    expect(profile).not.toMatch(/twoFactor|recoveryHashes|secret/i);
    await anon.dispose();
    await sneaky.dispose();
  });

  test("starting needs the right password", async ({ page }) => {
    const me = newUser("needpw");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: /Two-step sign-in…/ }).click();
    await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await page.getByLabel("Your password").fill("Not-the-password-1");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toContainText("That password isn't right");
    await expect(page.getByLabel("Setup key")).toHaveCount(0);
  });
});
