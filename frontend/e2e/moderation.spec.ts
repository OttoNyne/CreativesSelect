import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { apiUser, fakeIpHeaders, newUser, PASSWORD, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// The API treats these addresses as moderators (ADMIN_EMAILS; CI and e2e/README.md set it), one per browser project so each can have its own.
// Confirming the address needs the emailed link, which the API writes to MAIL_OUTBOX_DIR instead of sending.
const OUTBOX = process.env.MAIL_OUTBOX_DIR;

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
async function moderator(browser: Browser, baseURL: string, project: string): Promise<{ context: BrowserContext; page: Page; username: string }> {
  const email = `mod-${project}@example.com`;
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
  const username = `mod_${project}_${Math.random().toString(36).slice(2, 6)}`;
  const reg = await context.request.post("/api/auth/register", { data: { username, email, password: PASSWORD, displayName: `Moderator ${project}` } });
  if (reg.status() === 201) {
    const res = await context.request.post("/api/auth/verify-email", { data: { token: await confirmationToken(email) } });
    expect(res.status()).toBeLessThan(300);
  } else {
    expect(reg.status()).toBe(409); // an earlier run in this database made it; sign in instead
    const login = await context.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
    expect(login.status()).toBe(200);
  }
  const me = await (await context.request.get("/api/auth/me")).json();
  expect(me.user.isAdmin).toBe(true);
  const page = await context.newPage();
  return { context, page, username: me.user.username };
}

test.describe("the moderation review queue", () => {
  test.skip(!OUTBOX, "set MAIL_OUTBOX_DIR (the folder the API writes emails to) to run these");

  test("a moderator reviews reports: dismisses one, removes content and suspends its author, and everyone concerned is told", async ({ page, browser, baseURL }, testInfo) => {
    // a member writes a post and a blog entry; another member reports both
    const author = newUser("culprit");
    await signUpViaUi(page, author);
    const post = await (await page.request.post("/api/posts", { data: { content: `Spammy post ${author.username}` } })).json();
    const entry = await (await page.request.post("/api/blog", { data: { title: `Blog ${author.username}`, body: "Perfectly fine words" } })).json();
    const reporter = await apiUser(browser, baseURL!, "reporter");
    expect((await reporter.request.post("/api/reports", { data: { targetType: "post", targetId: post.post.id, reason: "this is spam" } })).status()).toBe(201);
    expect((await reporter.request.post("/api/reports", { data: { targetType: "blogEntry", targetId: entry.entry.id, reason: "I just don't like it" } })).status()).toBe(201);

    const mod = await moderator(browser, baseURL!, testInfo.project.name);
    await mod.page.goto("/");
    // on a phone the links are behind the menu button
    const menu = mod.page.getByRole("button", { name: "Menu" });
    await expect(menu.or(mod.page.getByRole("button", { name: "Log out" })).first()).toBeVisible();
    if (await menu.isVisible()) await menu.click();
    await expect(mod.page.getByRole("link", { name: "Moderation" }).first()).toBeVisible();
    await mod.page.goto("/admin/moderation");
    await expect(mod.page.getByRole("heading", { name: "Moderation" })).toBeVisible();

    // dismiss the blog entry report, with a note
    const blogCase = mod.page.getByRole("listitem").filter({ hasText: `Blog ${author.username}` });
    await expect(blogCase).toContainText("I just don't like it");
    await blogCase.getByLabel(/Note for the record/).fill("fine to me");
    await blogCase.getByRole("button", { name: "Dismiss" }).click();
    await expect(blogCase).toHaveCount(0);

    // remove the post and suspend its author
    const postCase = mod.page.getByRole("listitem").filter({ hasText: `Spammy post ${author.username}` });
    await expect(postCase).toContainText("this is spam");
    await expect(postCase).toContainText(author.displayName);
    mod.page.once("dialog", (d) => d.accept());
    await postCase.getByRole("button", { name: "Remove and suspend" }).click();
    await expect(postCase).toHaveCount(0); // (the queue is shared with the other browser projects, so it is not empty)

    // the record shows both decisions, and the account is listed as suspended
    await mod.page.getByRole("button", { name: "Handled" }).click();
    const decisions = mod.page.getByRole("listitem").filter({ hasText: `About ${author.displayName}` });
    await expect(decisions.filter({ hasText: "Content removed, account suspended" })).toHaveCount(1);
    await expect(decisions.filter({ hasText: "fine to me" })).toContainText("Dismissed");
    await mod.page.getByRole("button", { name: "Suspended accounts" }).click();
    const row = mod.page.getByRole("listitem").filter({ hasText: `@${author.username}` });
    await expect(row).toBeVisible();

    // the post is gone and the author can no longer sign in; their profile is hidden from others
    expect((await reporter.request.get(`/api/posts/${post.post.id}`)).status()).toBe(404);
    expect((await reporter.request.get(`/api/profiles/${author.username}`)).status()).toBe(404);
    const guest = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const login = await guest.newPage();
    await login.goto("/login");
    await login.getByPlaceholder("Email").fill(author.email);
    await login.getByPlaceholder("Password").fill(author.password);
    await login.getByRole("button", { name: "Log in" }).click();
    await expect(login.getByText(/has been suspended/)).toBeVisible();
    await expect(login).toHaveURL(/\/login$/);

    // the reporter is thanked, without details
    const bell = await reporter.context.newPage();
    await bell.goto("/");
    await bell.getByRole("button", { name: "Notifications" }).click();
    await expect(bell.getByText(/a moderator looked at your report/).first()).toBeVisible();

    // lifting the suspension lets them back in, and their profile returns
    mod.page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Lift suspension" }).click();
    await expect(row).toHaveCount(0);
    await login.getByRole("button", { name: "Log in" }).click();
    await expect(login).toHaveURL(/\/$/);
    expect((await reporter.request.get(`/api/profiles/${author.username}`)).status()).toBe(200);
    // and they are told what was removed
    await login.getByRole("button", { name: "Notifications" }).click();
    await expect(login.getByText(/removed your post for breaking the site's rules/)).toBeVisible();

    await guest.close();
    await mod.context.close();
    await reporter.context.close();
  });

  test("an ordinary member sees no Moderation link, and the screen and its data are not there for them", async ({ page }) => {
    await signUpViaUi(page, newUser("ordinary"));
    await expect(page.getByRole("link", { name: "Moderation" })).toHaveCount(0);
    await page.goto("/admin/moderation");
    await expect(page.getByText("There's nothing here.")).toBeVisible();
    for (const p of ["/api/admin/reports", "/api/admin/actions", "/api/admin/suspended"]) expect((await page.request.get(p)).status(), p).toBe(404);
    expect((await page.request.post("/api/admin/reports/resolve", { data: { targetType: "post", targetId: "5f1d7f3b8f1d7f3b8f1d7f3b", action: "dismiss" } })).status()).toBe(404);
  });

  test("reports are checked: a missing thing, yourself, and reporting twice", async ({ page }) => {
    const me = newUser("checker");
    await signUpViaUi(page, me);
    const mine = await (await page.request.get("/api/auth/me")).json();
    expect((await page.request.post("/api/reports", { data: { targetType: "user", targetId: mine.user.id, reason: "myself" } })).status()).toBe(400);
    expect((await page.request.post("/api/reports", { data: { targetType: "post", targetId: "5f1d7f3b8f1d7f3b8f1d7f3b", reason: "nothing there" } })).status()).toBe(404);
    const post = await (await page.request.post("/api/posts", { data: { content: "a post" } })).json();
    expect((await page.request.post("/api/reports", { data: { targetType: "post", targetId: post.post.id, reason: "once" } })).status()).toBe(201);
    const again = await page.request.post("/api/reports", { data: { targetType: "post", targetId: post.post.id, reason: "twice" } });
    expect(again.status()).toBe(200);
    expect((await again.json()).duplicate).toBe(true);
  });
});
