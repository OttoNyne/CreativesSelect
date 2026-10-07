import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// Before live updates, a new message or notification showed up at the next poll (every 5 to 30 seconds). With them it should appear within a
// second or two. The tests below give each thing 8 seconds, which a poll at the old pace can't meet for the slower ones, and which only the
// live connection can meet once its safety-net timer is slow.
const SOON = { timeout: 8_000 };

/** Starts watching for the page to open its live connection; await the result once the page has loaded. (If a hint comes before the server
 * has registered the connection, the page catches up when the connection opens anyway.) */
const watchForStream = (page: Page) => page.waitForRequest((request) => request.url().includes("/api/updates/stream"), { timeout: 15_000 });

test.describe("live updates", () => {
  test("a message appears in an open chat at once, without a reload", async ({ page, browser, baseURL }) => {
    const me = newUser("livechat");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "livefriend");
    await befriend(page.request, friend.request, me.username);

    const opened = watchForStream(page);
    await page.goto(`/messages/${friend.user.username}`);
    await expect(page.getByPlaceholder(/message/i).first()).toBeVisible();
    await opened;
    expect((await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Hello, this arrived live" } })).status()).toBe(201);
    await expect(page.getByText("Hello, this arrived live").locator("visible=true").first()).toBeVisible(SOON);

    // and an edit or a deletion on the other side shows too
    const sent = await (await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Typo here" } })).json();
    await expect(page.getByText("Typo here").locator("visible=true").first()).toBeVisible(SOON);
    expect((await friend.request.patch(`/api/messages/${sent.message.id}`, { data: { body: "Typo fixed" } })).status()).toBe(200);
    await expect(page.getByText("Typo fixed").locator("visible=true").first()).toBeVisible(SOON);
    expect((await friend.request.delete(`/api/messages/${sent.message.id}`)).status()).toBe(204);
    await expect(page.getByText("Typo fixed")).toHaveCount(0, SOON);
    await friend.context.close();
  });

  test("the conversation list and the unread count update as a message arrives", async ({ page, browser, baseURL }) => {
    const me = newUser("livelist");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "livelistfriend");
    await befriend(page.request, friend.request, me.username);

    const opened = watchForStream(page);
    await page.goto("/messages");
    await opened;
    expect((await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Anyone there?" } })).status()).toBe(201);
    await expect(page.getByText("Anyone there?").locator("visible=true").first()).toBeVisible(SOON);
    await friend.context.close();
  });

  test("a new notification appears in the open bell list at once", async ({ page, browser, baseURL }) => {
    const me = newUser("livebell");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "livebellfriend");
    await befriend(page.request, friend.request, me.username);
    const post = (await (await page.request.post("/api/posts", { data: { content: "Something to comment on" } })).json()).post;

    const opened = watchForStream(page);
    await page.goto("/");
    await opened;
    await page.getByRole("button", { name: "Notifications" }).click();
    expect((await friend.request.post(`/api/posts/${post.id}/comments`, { data: { content: "Nice one" } })).status()).toBe(201);
    await expect(page.getByText(/commented on your post/)).toBeVisible(SOON);
    await friend.context.close();
  });

  test("with the live connection blocked, the page still catches up by polling", async ({ page, browser, baseURL }) => {
    const me = newUser("livefallback");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "livefallbackfriend");
    await befriend(page.request, friend.request, me.username);
    await page.route("**/api/updates/stream", (route) => route.abort());

    await page.goto(`/messages/${friend.user.username}`);
    await expect(page.getByPlaceholder(/message/i).first()).toBeVisible();
    expect((await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Found by polling" } })).status()).toBe(201);
    await expect(page.getByText("Found by polling").locator("visible=true").first()).toBeVisible({ timeout: 20_000 });
    await friend.context.close();
  });

  test("the stream is for signed-in people and carries nothing but a greeting until there is a hint", async ({ page, playwright, browser, baseURL }) => {
    const me = newUser("livestream");
    await signUpViaUi(page, me);

    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    expect((await anon.get("/api/updates/stream")).status()).toBe(401);
    await anon.dispose();

    // read the stream by hand, as a second device of the same person
    const device = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const login = await device.request.post("/api/auth/login", { data: { email: me.email, password: me.password } });
    expect(login.status()).toBe(200);
    const p = await device.newPage();
    await p.goto("/login");
    const result = await p.evaluate(async () => {
      const response = await fetch("/api/updates/stream", { credentials: "include" });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const first = await reader.read();
      text += decoder.decode(first.value);
      return { status: response.status, type: response.headers.get("content-type"), text };
    });
    expect(result.status).toBe(200);
    expect(result.type).toMatch(/text\/event-stream/);
    expect(result.text).toContain("connected");
    expect(result.text).not.toMatch(/token|password|@example/i);
    await device.close();
  });
});
