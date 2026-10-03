import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fakeIpHeaders, logInViaUi, newUser, signUpViaUi, logOut } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// The API writes emails to this folder instead of sending them (MAIL_OUTBOX_DIR; CI sets it,
// and so does e2e/README.md for local runs). Without it the emailed-link test is skipped.
const OUTBOX = process.env.MAIL_OUTBOX_DIR;

// A message file, or null if it can't be read as one (for instance, if it is being replaced as we look).
async function readMail(file: string): Promise<{ to: string; subject: string; text: string } | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function emailTo(address: string, subject: RegExp): Promise<string> {
  let found = "";
  await expect
    .poll(
      async () => {
        for (const name of (await readdir(OUTBOX!).catch(() => [] as string[])).filter((n) => n.endsWith(".json"))) {
          const mail = await readMail(path.join(OUTBOX!, name));
          if (mail && mail.to === address && subject.test(mail.subject)) found = mail.text;
        }
        return found;
      },
      { timeout: 20_000 }
    )
    .not.toBe("");
  return found;
}

test.describe("forgotten password", () => {
  test("the login page links to it, and asking for a link gives the same answer for any address", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    const stranger = `nobody_${Date.now().toString(36)}@example.com`; // a fresh address each run: requests are limited per address
    await page.getByLabel("Email").fill(stranger);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("has an account, a link to choose a new password is on its way");
  });

  test("a reset page without the emailed link, or with a bad one, explains and offers a new link", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Reset link needed" })).toBeVisible();

    await page.goto("/reset-password#token=" + "f".repeat(64));
    await page.getByLabel("New password", { exact: true }).fill("a-brand-new-pass");
    await page.getByLabel("Repeat new password").fill("a-brand-new-pass");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("alert")).toContainText("invalid or has expired");
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
    await expect(page).not.toHaveURL(/token=/); // the token isn't left in the address bar
  });

  test("the emailed link lets someone choose a new password and log in with it", async ({ page, browser, baseURL }) => {
    test.skip(!OUTBOX, "set MAIL_OUTBOX_DIR (the same folder the API writes emails to) to run this");
    const me = newUser("forgetful");
    await signUpViaUi(page, me);
    // an earlier session on another device, to check it gets signed out
    const other = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const otherPage = await other.newPage();
    await logInViaUi(otherPage, me);
    await expect(otherPage).toHaveURL("/");
    await logOut(page);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(me.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    const text = await emailTo(me.email, /reset your/i);
    const link = text.match(/https?:\/\/\S+\/reset-password#token=[a-f0-9]+/)![0];
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await page.getByLabel("New password", { exact: true }).fill("My-new-password-9");
    await page.getByLabel("Repeat new password").fill("My-new-password-9");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

    // the old password no longer works; the new one does
    await page.getByRole("link", { name: "Log in" }).last().click(); // the page's own button; the navbar has one too, earlier in the page
    await page.getByPlaceholder("Email").fill(me.email);
    await page.getByPlaceholder("Password").fill(me.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await page.getByPlaceholder("Password").fill("My-new-password-9");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL("/");

    // the link works only once
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await page.getByLabel("New password", { exact: true }).fill("Another-pass-12");
    await page.getByLabel("Repeat new password").fill("Another-pass-12");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("alert")).toContainText("invalid or has expired");

    // and the other device was signed out
    await otherPage.reload();
    await expect(otherPage).toHaveURL(/\/login$/);
    await other.close();
  });
});
