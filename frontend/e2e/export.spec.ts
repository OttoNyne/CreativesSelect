import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { apiUser, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

async function openPanel(page: Page, username: string) {
  await page.goto(`/u/${username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: /Download my data…/ }).click();
  return page.getByRole("region", { name: "Download my data" });
}

test.describe("download my data", () => {
  test("the owner downloads a file with what they wrote, and nothing that is someone else's or guards the account", async ({ page, browser, baseURL }) => {
    const me = newUser("export");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "exportfriend");
    expect((await page.request.post("/api/posts", { data: { content: "My own words for the file" } })).status()).toBe(201);
    expect((await friend.request.post("/api/posts", { data: { content: "The friend's private words" } })).status()).toBe(201);
    expect((await page.request.patch("/api/profiles/me", { data: { bio: "Potter from the north" } })).status()).toBe(200);

    const panel = await openPanel(page, me.username);
    await panel.getByLabel("Your password").fill(me.password);
    const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(String.raw`^creativesselect-${me.username}-\d{4}-\d{2}-\d{2}\.json$`));
    await expect(panel.getByRole("status")).toContainText("Saved as creativesselect-");
    await expect(panel.getByLabel("Your password")).toHaveValue("");

    const raw = await readFile((await download.path())!, "utf8");
    const data = JSON.parse(raw);
    expect(data.format).toBe("creativesselect-export-1");
    expect(data.account).toMatchObject({ username: me.username, email: me.email, bio: "Potter from the north" });
    expect(data.posts.map((p: { text: string }) => p.text)).toEqual(["My own words for the file"]);
    expect(raw).not.toContain("The friend's private words");
    expect(raw).not.toMatch(/passwordHash|twoFactor|recoveryHashes|\$2[aby]\$/);
    expect(raw).not.toContain(friend.user.email);
    await friend.context.close();
  });

  test("a wrong password gives a message and no file", async ({ page }) => {
    const me = newUser("exportwrong");
    await signUpViaUi(page, me);
    const panel = await openPanel(page, me.username);
    await panel.getByLabel("Your password").fill("Not-the-password-1");
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await panel.getByRole("button", { name: "Download" }).click();
    await expect(panel.getByRole("alert")).toContainText("Incorrect password");
    expect(downloaded).toBe(false);
  });

  test("the server asks for a sign-in and the password, marks the file as private, and keeps it to the person's own", async ({ page, playwright, baseURL }) => {
    const me = newUser("exportapi");
    await signUpViaUi(page, me);
    expect((await page.request.post("/api/posts", { data: { content: "Only mine" } })).status()).toBe(201);

    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    expect((await anon.post("/api/profiles/me/export", { data: { password: me.password } })).status()).toBe(401);
    await anon.dispose();

    expect((await page.request.post("/api/profiles/me/export", { data: {} })).status()).toBe(400);
    const res = await page.request.post("/api/profiles/me/export", { data: { password: me.password } });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename=/);

    const other = newUser("exportother");
    const otherPage = await (await page.context().browser()!.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() })).newPage();
    await signUpViaUi(otherPage, other);
    const theirs = await otherPage.request.post("/api/profiles/me/export", { data: { password: other.password } });
    expect(await theirs.text()).not.toContain("Only mine");
    // a wrong password gets nothing, and the file is always the signed-in person's own
    expect((await otherPage.request.post("/api/profiles/me/export", { data: { password: "Not-the-password-1" } })).status()).toBe(403);
  });
});
