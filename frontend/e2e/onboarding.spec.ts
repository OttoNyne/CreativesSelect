import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const checklist = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Getting started" });

test.describe("the getting-started checklist", () => {
  test("a new account sees it, its steps tick themselves as things get done, and it can be hidden for good", async ({ page, browser, baseURL }) => {
    const me = newUser("fresh");
    await signUpViaUi(page, me);

    // there on the feed straight after signing up, with nothing done
    await expect(checklist(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome to CreativesSelect, Fresh!/ })).toBeVisible();
    await expect(checklist(page).getByText("0 of 6 done")).toBeVisible();

    // "Write a short bio" opens their own profile ready to edit
    await checklist(page).getByRole("link", { name: "Write a short bio" }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${me.username}\\?edit=1`));
    const bio = page.getByPlaceholder(/Tell people what you make/);
    await expect(bio).toBeVisible();
    await bio.fill("I make small ceramics");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(async () => (await page.request.get(`/api/profiles/${me.username}`).then((r) => r.json())).user.bio).toBe("I make small ceramics");

    // back on the feed the bio step is ticked, and no longer a link
    await page.goto("/");
    await expect(checklist(page).getByText("1 of 6 done")).toBeVisible();
    await expect(checklist(page).getByRole("link", { name: "Write a short bio" })).toHaveCount(0);
    await expect(checklist(page).getByText("— done")).toHaveCount(1);

    // "Share your first post" takes them to the post box; posting ticks it
    await checklist(page).getByRole("button", { name: "Share your first post" }).click();
    await expect(page.getByPlaceholder(/Share what you're working on/)).toBeFocused();
    await page.getByPlaceholder(/Share what you're working on/).fill("My first post here");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("My first post here")).toBeVisible();
    await page.reload();
    await expect(checklist(page).getByText("2 of 6 done")).toBeVisible();

    // hide it: gone now, and still gone after a reload
    await checklist(page).getByRole("button", { name: "Hide this" }).click();
    await expect(checklist(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByPlaceholder(/Share what you're working on/)).toBeVisible();
    await expect(checklist(page)).toHaveCount(0);

    // hiding it didn't touch anyone else's
    const other = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const page2 = await other.newPage();
    await signUpViaUi(page2, newUser("another"));
    await expect(checklist(page2)).toBeVisible();
    await other.close();
  });

  test("the steps can't be ticked by asking: only real activity does it", async ({ page }) => {
    await signUpViaUi(page, newUser("honest"));
    const before = await (await page.request.get("/api/onboarding")).json();
    expect(before.steps.filter((s: { done: boolean }) => s.done)).toHaveLength(0);
    // there is no way to mark a step done: the only thing that can be sent is "hide"
    expect((await page.request.post("/api/onboarding/email")).status()).toBeGreaterThanOrEqual(400);
    expect((await page.request.patch("/api/profiles/me", { data: { onboardingDismissedAt: null, steps: ["email"] } })).status()).toBeLessThan(500);
    const after = await (await page.request.get("/api/onboarding")).json();
    expect(after.steps.filter((s: { done: boolean }) => s.done)).toHaveLength(0);
  });

  test("it stays out of the way on a phone-sized screen", async ({ page }) => {
    await signUpViaUi(page, newUser("small"));
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await expect(checklist(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
