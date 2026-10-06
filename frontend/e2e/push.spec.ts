import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// The API used for these runs has no push keys (as in CI), so they show how the site behaves when it can't send notifications yet. Sending
// and receiving are covered by the API's own tests with a stand-in sender, because a real push needs a browser maker's service.
test.describe("push notifications", () => {
  test("the owner's settings say plainly that notifications aren't available yet, and offer nothing to press", async ({ page }) => {
    const me = newUser("pusher");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const panel = page.getByRole("region", { name: "Notifications on this device" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/aren't available on this site yet/)).toBeVisible();
    await expect(panel.getByRole("button")).toHaveCount(0);
  });

  test("the server says it can't send, refuses to sign a device up, and keeps the switches", async ({ page }) => {
    await signUpViaUi(page, newUser("pushapi"));
    expect(await (await page.request.get("/api/push/key")).json()).toEqual({ enabled: false, publicKey: null });
    const subscribe = await page.request.post("/api/push/subscribe", { data: { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "x".repeat(40), auth: "y".repeat(12) } } } });
    expect(subscribe.status()).toBe(503);
    expect((await page.request.post("/api/push/test")).status()).toBe(503);
    const changed = await page.request.patch("/api/push/preferences", { data: { messages: false } });
    expect((await changed.json()).prefs.messages).toBe(false);
    expect((await (await page.request.get("/api/push/status")).json())).toMatchObject({ enabled: false, devices: 0, prefs: { messages: false, friends: true } });
    expect((await page.request.patch("/api/push/preferences", { data: { bogus: true } })).status()).toBe(400);
  });

  test("it is for signed-in people only", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    for (const path of ["/api/push/key", "/api/push/status"]) expect((await anon.get(path)).status(), path).toBe(401);
    expect((await anon.post("/api/push/subscribe", { data: {} })).status()).toBe(401);
    await anon.dispose();
  });

  test("the site serves its notification worker as a script, not as a page", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/javascript/);
    const text = await res.text();
    expect(text).toContain("notificationclick");
    expect(text).not.toMatch(/<html/i);
  });
});
