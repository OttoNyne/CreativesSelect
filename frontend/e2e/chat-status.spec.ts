import { expect, test } from "@playwright/test";
import { befriend, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const SOON = { timeout: 8_000 };
const LABEL = "Show friends when I've read their messages and when I'm typing";

test.describe("typing and seen", () => {
  test("a friend sees that I'm typing in our open chat, and it goes away by itself", async ({ page, browser, baseURL }) => {
    const me = newUser("typist");
    await signUpViaUi(page, me);
    const pal = await secondBrowserUser(browser, baseURL!, "typepal");
    await befriend(page.request, pal.context.request, me.username);

    await page.goto(`/messages/${pal.user.username}`);
    await pal.page.goto(`/messages/${me.username}`);
    await expect(page.getByLabel("Message")).toBeVisible();
    await expect(pal.page.getByLabel("Message")).toBeVisible();

    await page.getByLabel("Message").fill("Hello there");
    await expect(pal.page.getByText(/is typing/)).toBeVisible(SOON);
    // nothing more is typed, so it fades; nothing was sent, so no message appeared
    await expect(pal.page.getByText(/is typing/)).toBeHidden({ timeout: 12_000 });
    await expect(pal.page.getByText("Hello there")).toHaveCount(0);
    await pal.context.close();
  });

  test("the sender sees Seen under a message once the friend opens the chat, without reloading", async ({ page, browser, baseURL }) => {
    const me = newUser("seensender");
    await signUpViaUi(page, me);
    const pal = await secondBrowserUser(browser, baseURL!, "seenreader");
    await befriend(page.request, pal.context.request, me.username);

    await page.goto(`/messages/${pal.user.username}`);
    await page.getByLabel("Message").fill("Did you get this?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Did you get this?").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("Seen", { exact: true })).toHaveCount(0);

    await pal.page.goto(`/messages/${me.username}`);
    await expect(pal.page.getByText("Did you get this?").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("Seen", { exact: true })).toBeVisible(SOON);
    // the reader is never shown a "Seen" for what they received
    await expect(pal.page.getByText("Seen", { exact: true })).toHaveCount(0);
    await pal.context.close();
  });

  test("with it switched off in the settings, neither typing nor Seen shows, for either of us; and the choice is remembered", async ({ page, browser, baseURL }) => {
    const me = newUser("private");
    await signUpViaUi(page, me);
    const pal = await secondBrowserUser(browser, baseURL!, "privatepal");
    await befriend(page.request, pal.context.request, me.username);

    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const box = page.getByLabel(LABEL);
    await expect(box).toBeChecked();
    const saved = page.waitForResponse((r) => r.url().includes("/api/profiles/me") && r.request().method() === "PATCH");
    await box.click(); // the box follows what the server saved, so it changes once the save is back
    expect((await saved).status()).toBe(200);
    await expect(box).not.toBeChecked();
    await page.reload();
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByLabel(LABEL)).not.toBeChecked();

    // the friend types: I'm not shown it; I send: the friend reads it, and I'm not shown Seen
    await page.goto(`/messages/${pal.user.username}`);
    await pal.page.goto(`/messages/${me.username}`);
    await expect(pal.page.getByLabel("Message")).toBeVisible();
    await pal.page.getByLabel("Message").fill("I am typing to you");
    await page.getByLabel("Message").fill("Hi");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pal.page.getByText("Hi").locator("visible=true").first()).toBeVisible(SOON);
    await page.waitForTimeout(3_000);
    await expect(page.getByText(/is typing/)).toHaveCount(0);
    await expect(page.getByText("Seen", { exact: true })).toHaveCount(0);
    await expect(pal.page.getByText(/is typing/)).toHaveCount(0); // and my own typing isn't shown to them either
    await pal.context.close();
  });

  test("the typing endpoint is for friends only, answers the same either way, and the setting takes only true or false", async ({ page, playwright, browser, baseURL }) => {
    const me = newUser("typeapi");
    await signUpViaUi(page, me);
    const stranger = await secondBrowserUser(browser, baseURL!, "typestranger");

    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    expect((await anon.post(`/api/messages/with/${me.username}/typing`, { data: {} })).status()).toBe(401);
    await anon.dispose();
    expect((await page.request.post(`/api/messages/with/${stranger.user.username}/typing`, { data: {} })).status()).toBe(403);

    for (const bad of ["false", 0, null]) expect((await page.request.patch("/api/profiles/me", { data: { chatStatus: bad } })).status()).toBe(400);
    expect((await page.request.patch("/api/profiles/me", { data: { chatStatus: false } })).status()).toBe(200);
    expect((await (await page.request.get("/api/auth/me")).json()).user.chatStatus).toBe(false);
    // nobody else is shown it: not a stranger, and not a signed-out visitor
    expect(JSON.stringify(await (await stranger.context.request.get(`/api/profiles/${me.username}`)).json())).not.toContain("chatStatus");
    const visitor = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    expect(JSON.stringify(await (await visitor.get(`/api/profiles/${me.username}`)).json())).not.toContain("chatStatus");
    await visitor.dispose();
    await stranger.context.close();
  });
});
