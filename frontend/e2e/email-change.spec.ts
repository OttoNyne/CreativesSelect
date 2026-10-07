import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiUser, fakeIpHeaders, logInViaUi, logOut, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// The API writes emails to this folder instead of sending them (MAIL_OUTBOX_DIR; CI sets it). Without it the tests that read the emailed links are skipped.
const OUTBOX = process.env.MAIL_OUTBOX_DIR;

async function mailsTo(address: string, subject: RegExp): Promise<string[]> {
  const names = (await readdir(OUTBOX!).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort();
  const found: string[] = [];
  for (const name of names) {
    try {
      const mail = JSON.parse(await readFile(path.join(OUTBOX!, name), "utf8"));
      if (mail.to === address && subject.test(mail.subject)) found.push(mail.text);
    } catch {
      // being written as we look: it will be there next time
    }
  }
  return found;
}
async function waitForMail(address: string, subject: RegExp, count = 1): Promise<string[]> {
  let found: string[] = [];
  await expect.poll(async () => (found = await mailsTo(address, subject)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(count);
  return found;
}
const pathWithToken = (text: string, page: string) => text.match(new RegExp(String.raw`https?://\S+(/${page}#token=[a-f0-9]+)`))![1];

async function openForm(page: Page, username: string) {
  await page.goto(`/u/${username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: /Change email…/ }).click();
  return page.getByRole("form", { name: "Change email" });
}

test.describe("changing the email address", () => {
  test("the owner asks, opens the link from the new address, and from then on logs in with it", async ({ page, browser, baseURL }) => {
    test.skip(!OUTBOX, "set MAIL_OUTBOX_DIR (the folder the API writes emails to) to run this");
    const me = newUser("chmail");
    const newEmail = `new-${me.email}`;
    await signUpViaUi(page, me);

    const form = await openForm(page, me.username);
    await form.getByLabel("New email address").fill(newEmail);
    await form.getByLabel("Your password").fill(me.password);
    await form.getByRole("button", { name: "Send the link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "We've sent a link" })).toContainText(newEmail);

    // nothing has changed yet, and the OLD address was told (without the new address in full)
    const [notice] = await waitForMail(me.email, /change of email was asked for/);
    expect(notice).not.toContain(newEmail);
    expect(notice).toMatch(/change your password right away/);
    expect((await (await page.request.get("/api/auth/me")).json()).user.email).toBe(me.email);

    // the link goes to the new address; a visitor opening it (no sign-in needed) makes the change
    const [toNew] = await waitForMail(newEmail, /Confirm your new/);
    const opener = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const p = await opener.newPage();
    await p.goto(pathWithToken(toNew, "confirm-email-change"));
    await expect(p.getByRole("heading", { name: "Email changed" })).toBeVisible();
    expect(p.url()).not.toContain("token");
    // the link works once
    expect((await opener.request.post("/api/auth/email/confirm", { data: { token: toNew.match(/token=([a-f0-9]+)/)![1] } })).status()).toBe(400);
    await opener.close();

    expect((await (await page.request.get("/api/auth/me")).json()).user.email).toBe(newEmail);
    await logOut(page);
    await logInViaUi(page, { email: newEmail, password: me.password });
    await expect(page).toHaveURL("/");
    expect((await page.request.post("/api/auth/login", { data: { email: me.email, password: me.password } })).status()).toBe(401);
  });

  test("someone who moved the address can be undone from the old one: it comes back and every device is signed out", async ({ page, browser, baseURL }) => {
    test.skip(!OUTBOX, "set MAIL_OUTBOX_DIR (the folder the API writes emails to) to run this");
    const me = newUser("undomail");
    const newEmail = `thief-${me.email}`;
    await signUpViaUi(page, me);
    expect((await page.request.post("/api/auth/email/change", { data: { newEmail, password: me.password } })).status()).toBe(204);
    const [toNew] = await waitForMail(newEmail, /Confirm your new/);
    expect((await page.request.post("/api/auth/email/confirm", { data: { token: toNew.match(/token=([a-f0-9]+)/)![1] } })).status()).toBe(204);

    // the OLD address is told, with a link that puts it back
    const [told] = await waitForMail(me.email, /email on your CreativesSelect account was changed/);
    expect(told).toMatch(/within 7 days/);
    expect(told).not.toContain(newEmail);
    const owner = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const p = await owner.newPage();
    await p.goto(pathWithToken(told, "undo-email-change"));
    await expect(p.getByRole("heading", { name: "Your old email is back" })).toBeVisible();
    await expect(p.getByRole("link", { name: "Choose a new password" })).toBeVisible();
    await owner.close();

    // the device that made the change is signed out, the old address is the account's again, and the new one is not
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
    expect((await page.request.post("/api/auth/login", { data: { email: newEmail, password: me.password } })).status()).toBe(401);
    expect((await page.request.post("/api/auth/login", { data: { email: me.email, password: me.password } })).status()).toBe(200);
    await waitForMail(me.email, /was put back/);
  });

  test("a wrong password and an address someone else uses are refused with a reason, and change nothing", async ({ page, browser, baseURL }) => {
    const me = newUser("chmailbad");
    await signUpViaUi(page, me);
    const other = await apiUser(browser, baseURL!, "chmailother");

    const form = await openForm(page, me.username);
    await form.getByLabel("New email address").fill("fresh@example.com");
    await form.getByLabel("Your password").fill("Not-the-password-1");
    await form.getByRole("button", { name: "Send the link" }).click();
    await expect(form.getByRole("alert")).toContainText("That password isn't right");

    await form.getByLabel("New email address").fill(other.user.email);
    await form.getByLabel("Your password").fill(me.password);
    await form.getByRole("button", { name: "Send the link" }).click();
    await expect(form.getByRole("alert")).toContainText("already used by another account");
    expect((await (await page.request.get("/api/auth/me")).json()).user.email).toBe(me.email);
    await other.context.close();
  });

  test("the links are for people holding them: made-up ones are refused, and signing in isn't needed or given", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    for (const route of ["/api/auth/email/confirm", "/api/auth/email/revert"]) {
      for (const token of ["f".repeat(64), "short", ""]) {
        const res = await anon.post(route, { data: { token } });
        expect(res.status(), `${route} ${token}`).toBe(400);
        expect((await res.json()).error).toBe("This link is invalid or has expired");
        expect(res.headers()["set-cookie"]).toBeUndefined();
      }
    }
    expect((await anon.post("/api/auth/email/change", { data: { newEmail: "a@b.com", password: "x" } })).status()).toBe(401);
    await anon.dispose();
  });
});
