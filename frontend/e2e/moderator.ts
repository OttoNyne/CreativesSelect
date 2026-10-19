import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fakeIpHeaders, PASSWORD } from "./helpers";

// The API treats these addresses as moderators (ADMIN_EMAILS; CI and e2e/README.md set it), one per browser project so each can have its own.
// Confirming the address needs the emailed link, which the API writes to MAIL_OUTBOX_DIR instead of sending.
export const OUTBOX = process.env.MAIL_OUTBOX_DIR;

async function confirmationToken(address: string): Promise<string> {
  let token = "";
  await expect
    .poll(
      async () => {
        const names = (await readdir(OUTBOX!).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort();
        for (const name of names.reverse()) {
          try {
            const mail = JSON.parse(await readFile(path.join(OUTBOX!, name), "utf8"));
            const match = mail.to === address && /Confirm your/.test(mail.subject) ? String(mail.text).match(/verify-email#token=([a-f0-9]+)/) : null;
            if (match) return (token = match[1]);
          } catch {
            // being written; look again
          }
        }
        return "";
      },
      { timeout: 20_000 }
    )
    .not.toBe("");
  return token;
}

/** A moderator in a browser of their own: signed up (or signed in if this database has seen them before) with the address confirmed. */
export async function moderator(browser: Browser, baseURL: string, project: string): Promise<{ context: BrowserContext; page: Page; username: string }> {
  const email = `mod-${project}@example.com`;
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
  const username = `mod_${project}_${Math.random().toString(36).slice(2, 6)}`;
  const reg = await context.request.post("/api/auth/register", { data: { username, email, password: PASSWORD, displayName: `Moderator ${project}` } });
  if (reg.status() === 201) {
    const res = await context.request.post("/api/auth/verify-email", { data: { token: await confirmationToken(email) } });
    expect(res.status()).toBeLessThan(300);
  } else {
    // an earlier run in this database made it, or another test in this browser is making it right now (two of these tests share
    // one address per browser): sign in, and wait until it is confirmed
    expect([409, 500]).toContain(reg.status());
    await expect
      .poll(
        async () => {
          const login = await context.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
          if (login.status() !== 200) return false;
          return (await (await context.request.get("/api/auth/me")).json()).user.isAdmin;
        },
        { timeout: 30_000 }
      )
      .toBe(true);
  }
  const me = await (await context.request.get("/api/auth/me")).json();
  expect(me.user.isAdmin).toBe(true);
  const page = await context.newPage();
  return { context, page, username: me.user.username };
}
