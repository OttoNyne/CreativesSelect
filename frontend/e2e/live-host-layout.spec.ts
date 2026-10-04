import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// The local test server has no media server, so lives here start browser-to-browser (no stage). To see the stage layouts, the
// room is described to the page as a big live and the stage is made up. (The page's own audio connection then can't be made,
// which doesn't matter for what is checked here: where things are, and what the buttons ask the server.)
const person = (id: string, name: string) => ({ id, username: id, displayName: name, avatarUrl: null, bio: null });
const STAGE = {
  enabled: true,
  maxGuests: 9,
  me: null,
  guests: [{ user: person("g1", "Lena")}],
  requests: [{ user: person("r1", "Cyd") }, { user: person("r2", "Dee") }],
  invited: [{ user: person("i1", "Bob") }],
  listeners: [{ user: person("l1", "Fi") }, { user: person("l2", "Gus") }, { user: person("l3", "Hal") }],
};

async function goLiveAsBigLive(page: Page, calls: string[] = []) {
  await page.route("**/api/live/*", async (route) => {
    const res = await route.fetch();
    if (route.request().method() !== "GET") return route.fulfill({ response: res });
    const body = await res.json();
    if (body.live) body.live = { ...body.live, mode: "sfu", maxGuests: 9, maxListeners: 50 };
    return route.fulfill({ response: res, json: body });
  });
  await page.route("**/api/live/*/stage", (route) => route.fulfill({ json: STAGE }));
  await page.route("**/api/live/*/stage/*", (route) => {
    calls.push(`${route.request().method()} ${route.request().url().split("/stage/")[1]} ${route.request().postData() ?? ""}`);
    return route.fulfill({ json: { stage: "listener" } });
  });
  await signUpViaUi(page, newUser("hostui"));
  await page.goto("/live");
  await page.getByLabel("Live title").fill("Layout " + Math.random().toString(36).slice(2, 6));
  await page.getByRole("button", { name: "Go live", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[a-f0-9]{24}$/);
  await expect(page.getByRole("button", { name: /Mute microphone/ })).toBeVisible();
}

test.describe("the host's live screen", () => {
  test.beforeEach(({ browserName }) => test.skip(browserName !== "chromium", "needs Chrome's fake microphone"));

  test("on a wide screen the stage is a grid of tiles, with who is listening and the chat beside it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await goLiveAsBigLive(page);
    const stage = page.getByRole("list", { name: "The stage" });
    await expect(stage).toBeVisible();

    // you first, then each guest, each invitation waiting, and an open place for every one still free
    const tiles = stage.getByRole("listitem");
    await expect(tiles.first()).toHaveAccessibleName(/^You/);
    await expect(stage.getByRole("listitem", { name: /^Lena/ })).toBeVisible();
    await expect(stage.getByRole("listitem", { name: /^Bob.*invited/i })).toBeVisible();
    await expect(stage.getByRole("button", { name: "Invite someone to speak" })).toHaveCount(7); // 9 places − Lena − Bob
    await expect(page.getByText("2 of 9 guest places used")).toBeVisible();

    // who is asking, and who is listening, are beside it
    const asking = page.getByRole("region", { name: "Asking to speak" });
    await expect(asking.getByRole("button", { name: "Invite Cyd to speak" })).toBeVisible();
    const listeners = page.getByRole("region", { name: "Listeners" });
    await expect(listeners.getByRole("button", { name: "Invite Fi to speak" })).toBeVisible();
    await expect(page.getByText("LIVE CHAT", { exact: false })).toBeVisible();

    // and there is no tab bar
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("a guest can be removed from their tile, and the controls are in reach", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const calls: string[] = [];
    await goLiveAsBigLive(page, calls);
    await page.getByRole("button", { name: "Remove Lena from the stage" }).click();
    await expect.poll(() => calls.some((c) => c.startsWith("POST remove") && c.includes("g1"))).toBe(true);

    await page.getByRole("button", { name: "Invite Fi to speak" }).click();
    await expect.poll(() => calls.some((c) => c.startsWith("POST invite") && c.includes("l1"))).toBe(true);

    await page.getByRole("button", { name: "Mute microphone" }).click();
    await expect(page.getByRole("listitem", { name: /^You.*muted/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "End live" })).toBeVisible();
  });

  test("on a phone the controls stay on top, with a tab each for the stage, the listeners and the chat", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goLiveAsBigLive(page);
    const tabs = page.getByRole("tablist", { name: "Live screen" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: /^Stage/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("list", { name: "The stage" })).toHaveCount(0); // no tiles on a phone

    // the stage tab: who is speaking, who is waiting for an answer, who is asking
    await expect(page.getByRole("button", { name: "Remove Lena from the stage" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite Cyd to speak" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite Fi to speak" })).toBeHidden(); // that is on the listeners tab

    // the controls are on every tab
    for (const name of [/^Listeners/, /^Chat/, /^Stage/]) {
      await tabs.getByRole("tab", { name }).click();
      await expect(page.getByRole("button", { name: "Mute microphone" })).toBeVisible();
      await expect(page.getByRole("button", { name: "End live" })).toBeVisible();
    }

    await tabs.getByRole("tab", { name: /^Listeners/ }).click();
    await expect(tabs.getByRole("tab", { name: /^Listeners/ })).toHaveText(/\(3\)/);
    await expect(page.getByRole("button", { name: "Invite Fi to speak" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Lena from the stage" })).toBeHidden();

    await tabs.getByRole("tab", { name: /^Chat/ }).click();
    await expect(page.getByLabel(/message|comment/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("a tab other than the stage says when someone is asking to speak", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goLiveAsBigLive(page);
    const tabs = page.getByRole("tablist", { name: "Live screen" });
    await expect(tabs.getByRole("tab", { name: /^Stage/ })).not.toContainText("2"); // already looking at it
    await tabs.getByRole("tab", { name: /^Chat/ }).click();
    await expect(tabs.getByRole("tab", { name: /^Stage/ })).toContainText("2");
    await tabs.getByRole("tab", { name: /^Stage/ }).click();
    await expect(tabs.getByRole("tab", { name: /^Stage/ })).not.toContainText("2");
  });

  test("the layout follows the screen, without losing anything", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await goLiveAsBigLive(page);
    await expect(page.getByRole("list", { name: "The stage" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("button", { name: "End live" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("list", { name: "The stage" })).toBeVisible();
  });

  test("everything on the screen can be read, in both layouts and on every tab", async ({ page }) => {
    const readable = async (where: string) => {
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      const problems = results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ") + " — " + (n.any[0]?.message ?? v.help).replace(/s+/g, " ")));
      expect(problems, "unreadable text on " + where).toEqual([]);
    };
    await page.setViewportSize({ width: 1280, height: 900 });
    await goLiveAsBigLive(page);
    await page.waitForTimeout(500);
    await readable("the wide layout");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of [/^Stage/, /^Listeners/, /^Chat/]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(200);
      await readable("the phone layout, " + tab);
    }
  });

  test("a live without a stage keeps the simple screen at any size", async ({ page }) => {
    await signUpViaUi(page, newUser("plainhost"));
    await page.goto("/live");
    await page.getByLabel("Live title").fill("Plain " + Math.random().toString(36).slice(2, 6));
    await page.getByRole("button", { name: "Go live", exact: true }).click();
    await expect(page.getByRole("button", { name: /Mute microphone/ })).toBeVisible();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByRole("tablist")).toHaveCount(0);
      await expect(page.getByRole("list", { name: "The stage" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "End live" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
