import { expect, test, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// The API writes emails to this folder instead of sending them (MAIL_OUTBOX_DIR; CI sets it, and e2e/README.md
// says how for local runs). Without it the tests that read the emailed link are skipped.
const OUTBOX = process.env.MAIL_OUTBOX_DIR;

// A message file, or null if it can't be read as one (for instance, if it is being replaced as we look).
async function readMail(file: string): Promise<{ to: string; subject: string; text: string } | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

// Every email of this kind sent to this address so far, oldest first.
async function mailsTo(address: string, subject: RegExp): Promise<string[]> {
  const names = (await readdir(OUTBOX!).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort(); // names start with a timestamp
  const found: string[] = [];
  for (const name of names) {
    const mail = await readMail(path.join(OUTBOX!, name));
    if (mail && mail.to === address && subject.test(mail.subject)) found.push(mail.text);
  }
  return found;
}
async function waitForMails(address: string, count: number): Promise<string[]> {
  let found: string[] = [];
  await expect.poll(async () => (found = await mailsTo(address, /Confirm your/)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(count);
  return found;
}
const linkIn = (text: string) => text.match(/https?:\/\/\S+\/verify-email#token=[a-f0-9]+/)![0].replace(/^https?:\/\/[^/]+/, "");
const banner = (page: Page) => page.getByRole("region", { name: "Confirm your email" });

test.describe("confirming your email address", () => {
  test("a new account is reminded, the emailed link confirms it, and the reminder goes away", async ({ page }) => {
    test.skip(!OUTBOX, "set MAIL_OUTBOX_DIR (the folder the API writes emails to) to run this");
    const me = newUser("verifier");
    await signUpViaUi(page, me);
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText(me.email);

    const [mail] = await waitForMails(me.email, 1);
    expect(mail).toContain("/verify-email#token=");
    await page.goto(linkIn(mail));
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await expect(page).not.toHaveURL(/token=/); // the token isn't left in the address bar
    await expect(banner(page)).toHaveCount(0);

    await page.getByRole("link", { name: "Go to your feed" }).click();
    await page.reload();
    await expect(page.getByPlaceholder(/Share what you're working on/)).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    // the link only works once
    await page.goto(linkIn(mail));
    await expect(page.getByRole("heading", { name: "Couldn't confirm your email" })).toBeVisible();
  });

  test("a fresh link can be asked for, and it replaces the old one", async ({ page }) => {
    test.skip(!OUTBOX, "set MAIL_OUTBOX_DIR (the folder the API writes emails to) to run this");
    const me = newUser("resender");
    await signUpViaUi(page, me);
    const [first] = await waitForMails(me.email, 1);

    await banner(page).getByRole("button", { name: "Resend email" }).click();
    await expect(banner(page).getByRole("status")).toContainText("Sent");
    const [, second] = await waitForMails(me.email, 2);
    expect(linkIn(second)).not.toBe(linkIn(first));

    await page.goto(linkIn(first));
    await expect(page.getByRole("heading", { name: "Couldn't confirm your email" })).toBeVisible(); // the old one is dead
    await page.goto(linkIn(second));
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  });
});

test.describe("the confirmation page", () => {
  test("explains a link that doesn't work, and one that is missing", async ({ page }) => {
    await page.goto("/verify-email#token=" + "f".repeat(64));
    await expect(page.getByRole("heading", { name: "Couldn't confirm your email" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("invalid or has expired");
    await expect(page).not.toHaveURL(/token=/);

    await page.goto("/verify-email");
    await expect(page.getByRole("heading", { name: "Confirmation link needed" })).toBeVisible();
  });

  test("the reminder can be closed and stays closed while browsing", async ({ page }) => {
    await signUpViaUi(page, newUser("dismisser"));
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole("button", { name: "Dismiss this reminder" }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.goto("/friends");
    await expect(page.getByText(/Friends \(0\)|No friends yet/).first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("the profile's edit panel shows the status and a way to get a new link", async ({ page }) => {
    const me = newUser("statuser");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByText("Not confirmed yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send confirmation email" })).toBeVisible();
  });
});
