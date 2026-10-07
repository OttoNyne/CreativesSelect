import { expect, test, type Page } from "@playwright/test";
import { codeAt, fakeIpHeaders, logOut, newUser, signUpViaUi, type TestUser } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// A passkey needs a device that holds a key and checks the person. Chromium can pretend to be one (a "virtual authenticator", over its
// debugging protocol), which makes the real browser calls work end to end. The other two browsers can't be driven that way, so the flows
// that need the device run in Chromium only; the checks that need none run in all three.
const needsDevice = (browserName: string) => test.skip(browserName !== "chromium", "needs Chromium's virtual authenticator");

async function addDevice(page: Page, { verified = true } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: verified, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

async function openPanel(page: Page, username: string) {
  await page.goto(`/u/${username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: /Passkeys…/ }).click();
  return page.getByRole("region", { name: "Passkeys" });
}

async function addPasskey(page: Page, me: TestUser, name = "My laptop") {
  const panel = await openPanel(page, me.username);
  await panel.getByRole("button", { name: "Add a passkey" }).click();
  await panel.getByLabel("Your password").fill(me.password);
  await panel.getByLabel("Name for this passkey (optional)").fill(name);
  await panel.getByRole("button", { name: "Add passkey" }).click();
  await expect(panel.getByRole("status")).toContainText(`Added “${name}”`);
  return panel;
}

test.describe("passkeys", () => {
  test("an owner adds a passkey, logs out, and logs back in with it alone", async ({ page, browserName }) => {
    needsDevice(browserName);
    const me = newUser("passkey");
    await signUpViaUi(page, me);
    await addDevice(page);

    const panel = await addPasskey(page, me);
    await expect(panel.getByRole("list", { name: "Your passkeys" })).toContainText("My laptop");
    await expect(panel.getByRole("list", { name: "Your passkeys" })).toContainText("never used");
    await logOut(page);

    // no email, no password, no code: the device does the asking
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page).toHaveURL("/");
    expect((await (await page.request.get("/api/auth/me")).json()).user.username).toBe(me.username);

    // and now it shows as used
    const again = await openPanel(page, me.username);
    await expect(again.getByRole("list", { name: "Your passkeys" })).not.toContainText("never used");
  });

  test("it counts as both factors: with two-step sign-in on, a passkey logs in with no code", async ({ page, browserName }) => {
    needsDevice(browserName);
    const me = newUser("passkey2fa");
    await signUpViaUi(page, me);
    await addDevice(page);
    await addPasskey(page, me);

    const setup = await (await page.request.post("/api/auth/2fa/setup", { data: { password: me.password } })).json();
    expect((await page.request.post("/api/auth/2fa/enable", { data: { code: codeAt(setup.secret) } })).status()).toBe(200);
    await logOut(page);

    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page).toHaveURL("/");
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  });

  test("adding one needs the password (and a code, with two-step sign-in), and a wrong one adds nothing", async ({ page, browserName }) => {
    needsDevice(browserName);
    const me = newUser("passkeypw");
    await signUpViaUi(page, me);
    await addDevice(page);
    const panel = await openPanel(page, me.username);
    await panel.getByRole("button", { name: "Add a passkey" }).click();
    await panel.getByLabel("Your password").fill("Not-the-password-1");
    await panel.getByRole("button", { name: "Add passkey" }).click();
    await expect(panel.getByRole("alert")).toContainText("That password isn't right");
    await expect(panel.getByText("You haven't added any passkeys yet.")).toBeVisible();

    // with two-step sign-in on, a code is asked for as well
    const setup = await (await page.request.post("/api/auth/2fa/setup", { data: { password: me.password } })).json();
    expect((await page.request.post("/api/auth/2fa/enable", { data: { code: codeAt(setup.secret) } })).status()).toBe(200);
    await panel.getByLabel("Your password").fill(me.password);
    await panel.getByRole("button", { name: "Add passkey" }).click();
    await expect(panel.getByLabel("Code from your app")).toBeVisible();
    await panel.getByLabel("Code from your app").fill(codeAt(setup.secret, 30));
    await panel.getByRole("button", { name: "Add passkey" }).click();
    await expect(panel.getByRole("status")).toContainText("Added");
  });

  test("a passkey can be renamed and removed, and once removed it no longer signs anyone in", async ({ page, browserName }) => {
    needsDevice(browserName);
    const me = newUser("passkeyrm");
    await signUpViaUi(page, me);
    await addDevice(page);
    const panel = await addPasskey(page, me, "Old name");

    await panel.getByRole("button", { name: "Rename Old name" }).click();
    await panel.getByLabel("New name").fill("Desk laptop");
    await panel.getByRole("button", { name: "Save name" }).click();
    await expect(panel.getByRole("list", { name: "Your passkeys" })).toContainText("Desk laptop");

    await panel.getByRole("button", { name: "Remove Desk laptop" }).click();
    await panel.getByLabel("Your password").fill("Not-the-password-1");
    await panel.getByRole("button", { name: "Remove passkey" }).click();
    await expect(panel.getByRole("alert")).toContainText("That password isn't right");
    await panel.getByLabel("Your password").fill(me.password);
    await panel.getByRole("button", { name: "Remove passkey" }).click();
    await expect(panel.getByRole("status")).toContainText("Removed “Desk laptop”");
    await logOut(page);

    // the device still holds its half, but the site no longer knows the key
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.getByText(/That passkey didn't work/)).toBeVisible();
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  });

  test("a device that won't check the person can't make or use a passkey", async ({ page, browserName }) => {
    needsDevice(browserName);
    const me = newUser("passkeyuv");
    await signUpViaUi(page, me);
    await addDevice(page, { verified: false });
    const panel = await openPanel(page, me.username);
    await panel.getByRole("button", { name: "Add a passkey" }).click();
    await panel.getByLabel("Your password").fill(me.password);
    await panel.getByRole("button", { name: "Add passkey" }).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByText("You haven't added any passkeys yet.")).toBeVisible();
  });

  test("closing the device prompt isn't an error on the login page", async ({ page, browserName }) => {
    needsDevice(browserName);
    await page.goto("/login");
    await addDevice(page); // an authenticator with no passkey for this site: the browser has nothing to offer
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    // with nothing to offer the prompt ends, and the page is still usable
    await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByPlaceholder("Email")).toBeVisible();
  });

  test("the endpoints are for the right people: signed-in for the list and for adding, anyone for the sign-in questions, and made-up answers get nothing", async ({ page, playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    expect((await anon.get("/api/auth/passkeys")).status()).toBe(401);
    expect((await anon.post("/api/auth/passkeys/register/options", { data: { password: "x" } })).status()).toBe(401);
    expect((await anon.delete("/api/auth/passkeys/000000000000000000000000", { data: { password: "x" } })).status()).toBe(401);

    const options = await anon.post("/api/auth/passkeys/login/options", { data: {} });
    expect(options.status()).toBe(200);
    const body = await options.json();
    expect(body.userVerification).toBe("required");
    expect(body.challenge.length).toBeGreaterThan(20);

    const forged = await anon.post("/api/auth/passkeys/login/verify", { data: { response: { id: "x", rawId: "x", type: "public-key", response: { clientDataJSON: Buffer.from(JSON.stringify({ challenge: body.challenge, type: "webauthn.get", origin: baseURL })).toString("base64url"), authenticatorData: "AA", signature: "AA" } } } });
    expect(forged.status()).toBe(401);
    expect(forged.headers()["set-cookie"]).toBeUndefined();
    await anon.dispose();

    const me = newUser("passkeyapi");
    await signUpViaUi(page, me);
    const list = await (await page.request.get("/api/auth/passkeys")).json();
    expect(list.passkeys).toEqual([]);
    expect(list.max).toBe(10);
    expect(JSON.stringify(await (await page.request.get(`/api/profiles/${me.username}`)).json())).not.toMatch(/credentialId|publicKey|counter/);
  });
});
