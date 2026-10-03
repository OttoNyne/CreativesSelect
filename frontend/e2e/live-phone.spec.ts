import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// Stand-in for the screen lock that phones have, so the page's use of it can be seen.
async function stubWakeLock(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __wake: string[] }).__wake = log;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type: string) => {
          log.push("request:" + type);
          return { release: async () => void log.push("release") };
        },
      },
    });
  });
}
const wakeLog = (page: Page) => page.evaluate(() => (window as unknown as { __wake: string[] }).__wake);

test.describe("going live from a phone", () => {
  test("the screen is kept on while live and let go when the live ends", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "needs Chrome's fake microphone");
    await stubWakeLock(page);
    await signUpViaUi(page, newUser("mobilehost"));
    await page.goto("/live");
    await page.getByLabel("Live title").fill("Phone live " + Math.random().toString(36).slice(2, 6));
    await page.getByRole("button", { name: "Go live", exact: true }).click();
    await expect(page.getByText("You're live — listeners can hear your microphone.")).toBeVisible();
    await expect.poll(() => wakeLog(page)).toContain("request:screen");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "End live" }).click();
    await expect(page).toHaveURL(/\/live$/);
    await expect.poll(() => wakeLog(page)).toContain("release");
  });

  test("a browser without a screen lock goes live just the same", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "needs Chrome's fake microphone");
    await page.addInitScript(() => Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined }));
    await signUpViaUi(page, newUser("nolock"));
    await page.goto("/live");
    await page.getByLabel("Live title").fill("No lock live " + Math.random().toString(36).slice(2, 6));
    await page.getByRole("button", { name: "Go live", exact: true }).click();
    await expect(page.getByText("You're live — listeners can hear your microphone.")).toBeVisible();
    // and no warnings about the connection or the microphone while all is well
    await expect(page.getByText(/Your connection dropped/)).toHaveCount(0);
    await expect(page.getByText(/paused the microphone/)).toHaveCount(0);
  });

  test("the live carries on through a short loss of network", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "needs Chrome's fake microphone");
    await signUpViaUi(page, newUser("blip"));
    await page.goto("/live");
    await page.getByLabel("Live title").fill("Blip live " + Math.random().toString(36).slice(2, 6));
    await page.getByRole("button", { name: "Go live", exact: true }).click();
    await expect(page.getByText("You're live — listeners can hear your microphone.")).toBeVisible();
    const id = page.url().split("/live/")[1];

    await page.context().setOffline(true);
    await page.waitForTimeout(6_000);
    await page.context().setOffline(false);
    await page.waitForTimeout(3_000);

    // still live, for the host and on the server
    await expect(page.getByText("You're live — listeners can hear your microphone.")).toBeVisible();
    const live = await (await page.request.get(`/api/live/${id}`)).json();
    expect(live.live.status).toBe("live");
  });
});
