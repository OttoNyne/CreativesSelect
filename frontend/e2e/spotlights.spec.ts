import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";
import { OUTBOX, moderator } from "./moderator";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// The two slots are the same for everyone, so these tests take turns instead of running side by side.
test.describe.configure({ mode: "serial" });

// a one-pixel picture, so nothing has to be fetched from anywhere
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const tag = () => randomBytes(3).toString("hex");

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

type Person = Awaited<ReturnType<typeof apiUser>>;
/** Someone with a headline and one picture, ready to be put on the main screen. */
async function artist(browser: Parameters<typeof apiUser>[0], baseURL: string, label: string, headline: string) {
  const who = await apiUser(browser, baseURL, label);
  expect((await who.request.patch("/api/profiles/me", { data: { headline, tags: ["painter", "muralist"] } })).status()).toBe(200);
  const made = await who.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: `Work by ${label}` } });
  expect(made.status()).toBe(201);
  return who;
}
const spotlights = async (who: Person) => ((await (await who.request.get("/api/spotlights")).json()).spotlights as { slot: number; user: { username: string } }[]).map((s) => [s.slot, s.user.username]);

test.describe("artist spotlights on the main screen", () => {
  test.skip(!OUTBOX, "set MAIL_OUTBOX_DIR (the folder the API writes emails to) to run these");

  test("an administrator fills the two slots, and visitors see them on the main screen, members at the top of their feed", async ({ browser, baseURL }, testInfo) => {
    const id = tag();
    const ann = await artist(browser, baseURL!, `ann${id}`, "Illustrator · open to commissions");
    const ben = await artist(browser, baseURL!, `ben${id}`, "Sound designer");
    const mod = await moderator(browser, baseURL!, testInfo.project.name);

    // the administrator chooses, in the Spotlights tab of the moderation page
    await mod.page.goto("/admin/moderation");
    await mod.page.getByRole("button", { name: "Spotlights" }).click();
    await expect(mod.page.getByRole("region", { name: "Artist spotlights" })).toBeVisible();
    const one = mod.page.getByRole("region", { name: "Slot 1" });
    await one.getByLabel("Username").fill(ann.user.username);
    await one.getByRole("button", { name: "Find their pictures" }).click();
    await one.getByRole("radio", { name: `Work by ann${id}` }).check({ force: true });
    await one.getByLabel(/A line about them/).fill("Her murals are everywhere");
    await one.getByRole("button", { name: "Show in slot 1" }).click();
    await expect(mod.page.getByRole("region", { name: "Slot 1" }).getByText("Saved. The main screen shows this within a minute.")).toBeVisible();
    const two = mod.page.getByRole("region", { name: "Slot 2" });
    await two.getByLabel("Username").fill(ben.user.username);
    await two.getByRole("button", { name: "Show in slot 2" }).click();
    await expect(mod.page.getByRole("region", { name: "Slot 2" }).getByText("Saved. The main screen shows this within a minute.")).toBeVisible();
    await expectNoHorizontalOverflow(mod.page);
    await expectReadable(mod.page, "the spotlights tab");
    expect(await spotlights(ann)).toEqual([[1, ann.user.username], [2, ben.user.username]]);

    // someone with no account sees them on the main screen, before signing up
    const stranger = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const visitor = await stranger.newPage();
    await visitor.goto("/");
    await expect(visitor.getByRole("heading", { level: 1, name: "Show your work. Get found. Get hired." })).toBeVisible();
    await expect(visitor).toHaveTitle(/Show your work\. Get found\. Get hired\./);
    const region = visitor.getByRole("region", { name: "Artist spotlights" });
    await expect(region).toBeVisible();
    await expect(region.getByRole("link", { name: ann.user.displayName, exact: true })).toHaveAttribute("href", `/u/${ann.user.username}`);
    await expect(region.getByRole("link", { name: ben.user.displayName, exact: true })).toBeVisible();
    await expect(region.getByText("Her murals are everywhere")).toBeVisible();
    await expect(region.getByText("Illustrator · open to commissions")).toBeVisible();
    await expect(region.getByText("#muralist").first()).toBeVisible();
    // the first person's chosen picture really loads
    await expect.poll(() => region.locator("img").first().evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(visitor.getByRole("link", { name: "Join CreativesSelect" })).toHaveAttribute("href", "/register");
    await expect(visitor.getByRole("link", { name: "Log in" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(visitor);
    await expectReadable(visitor, "the main screen for a visitor");
    // nothing about either person beyond what a public profile shows
    expect(await visitor.content()).not.toContain("@example.com");
    await region.getByRole("link", { name: `View ${ann.user.displayName}'s profile` }).click();
    await expect(visitor).toHaveURL(new RegExp(`/u/${ann.user.username}$`));
    await stranger.close();

    // a member sees the same two at the top of their feed, above the post box
    const member = newUser("member");
    const mpage = await (await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() })).newPage();
    await signUpViaUi(mpage, member);
    const feedRegion = mpage.getByRole("region", { name: "Artist spotlights" });
    await expect(feedRegion).toBeVisible();
    await expect(feedRegion.getByRole("link", { name: ben.user.displayName, exact: true })).toBeVisible();
    const regionY = (await feedRegion.boundingBox())!.y;
    const composerY = (await mpage.getByPlaceholder(/Share what you're working on/).boundingBox())!.y;
    expect(regionY).toBeLessThan(composerY);
    await expectNoHorizontalOverflow(mpage);
    await expectReadable(mpage, "the feed with the spotlights");

    // and they stay readable on the backgrounds a member can choose for their feed, light ones included
    for (const theme of [
      { bgColor: "#ffffff", textColor: "#111111", accentColor: "#6d28d9" },
      { bgColor: "#fdf6e3", textColor: "#222222", accentColor: "#ffe14d" },
      { bgColor: "#f4efe3", textColor: "#fafafa", accentColor: "#f4efe3" },
    ]) {
      expect((await mpage.request.patch("/api/profiles/me", { data: { theme } })).status()).toBe(200);
      await mpage.goto("/");
      await expect(mpage.getByRole("region", { name: "Artist spotlights" })).toBeVisible();
      await expectReadable(mpage, `the feed with the spotlights on ${theme.bgColor}`);
    }
    await mpage.context().close();

    // empty a slot: it is gone for everyone
    await mod.page.getByRole("region", { name: "Slot 2" }).getByRole("button", { name: "Empty this slot" }).click();
    await expect(mod.page.getByRole("region", { name: "Slot 2" }).getByText("Nobody yet: this slot is empty.")).toBeVisible();
    expect(await spotlights(ann)).toEqual([[1, ann.user.username]]);

    // clear the other one too, so the next run starts empty
    await mod.page.getByRole("region", { name: "Slot 1" }).getByRole("button", { name: "Empty this slot" }).click();
    await expect.poll(() => spotlights(ann)).toEqual([]);
    for (const who of [ann, ben]) await who.context.close();
    await mod.context.close();
  });

  test("a person who goes private leaves the screen, only administrators can choose, and one person can't hold both slots", async ({ browser, baseURL }, testInfo) => {
    const id = tag();
    const ann = await artist(browser, baseURL!, `priv${id}`, "Painter");
    const mod = await moderator(browser, baseURL!, testInfo.project.name);
    const put = (slot: number, username: string) => mod.context.request.put(`/api/admin/spotlights/${slot}`, { data: { username } });

    expect((await put(1, ann.user.username)).status()).toBe(200);
    expect((await put(2, ann.user.username)).status()).toBe(409);
    expect(await spotlights(ann)).toEqual([[1, ann.user.username]]);

    // ordinary members are told nothing exists
    expect((await ann.request.put("/api/admin/spotlights/1", { data: { username: ann.user.username } })).status()).toBe(404);
    expect((await ann.request.get("/api/admin/spotlights")).status()).toBe(404);
    expect((await ann.request.delete("/api/admin/spotlights/1")).status()).toBe(404);

    // going private takes them off the public screen at once, and an administrator is told why
    expect((await ann.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    await expect.poll(() => spotlights(ann)).toEqual([]);
    const seen = (await (await mod.context.request.get("/api/admin/spotlights")).json()).slots[0];
    expect(seen).toMatchObject({ slot: 1, hidden: "private" });
    // and a private profile can't be put there
    expect((await put(2, ann.user.username)).status()).toBe(400);

    expect((await mod.context.request.delete("/api/admin/spotlights/1")).status()).toBe(204);
    await ann.context.close();
    await mod.context.close();
  });

  test("in Arabic the main screen reads right to left and fits a phone", async ({ browser, baseURL }, testInfo) => {
    const id = tag();
    const ann = await artist(browser, baseURL!, `arabic${id}`, "رسام");
    const mod = await moderator(browser, baseURL!, testInfo.project.name);
    expect((await mod.context.request.put("/api/admin/spotlights/1", { data: { username: ann.user.username, note: "أعمالها في كل مكان" } })).status()).toBe(200);

    const ctx = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders(), viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "اعرض أعمالك. دع الناس يجدونك. احصل على فرص عمل." })).toBeVisible();
    await expect(page.getByRole("region", { name: "فنانون في الواجهة" }).getByText("أعمالها في كل مكان")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the main screen in Arabic");
    await ctx.close();

    expect((await mod.context.request.delete("/api/admin/spotlights/1")).status()).toBe(204);
    await ann.context.close();
    await mod.context.close();
  });

  test("a visitor sees the landing page even when nobody is chosen yet, and other protected pages still send them to log in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Show your work. Get found. Get hired." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Join CreativesSelect" })).toBeVisible();
    await page.goto("/friends");
    await expect(page).toHaveURL(/\/login$/);
  });
});
