import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("following", () => {
  test("a visitor follows a public profile, its posts reach their feed, the person is told, and unfollowing takes them away", async ({ page, browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "maker");
    const words = `A post by ${maker.user.username}`;
    expect((await maker.request.post("/api/posts", { data: { content: words } })).status()).toBe(201);
    const me = newUser("follower");
    await signUpViaUi(page, me);
    await expect(page.getByText(words)).toHaveCount(0);

    await page.goto(`/u/${maker.user.username}`);
    await expect(page.getByLabel("Followers and following")).toHaveText("0 followers · 0 following");
    await page.getByRole("button", { name: new RegExp(`^Follow ${maker.user.displayName}`) }).click();
    await expect(page.getByRole("button", { name: /^Stop following/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Followers and following")).toHaveText("1 follower · 0 following");
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a followed profile");

    await page.goto("/");
    await expect(page.getByText(words)).toBeVisible();

    // they are told
    await expect.poll(async () => (await (await maker.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "follow")).toBe(true);

    await page.goto(`/u/${maker.user.username}`);
    await page.getByRole("button", { name: /^Stop following/ }).click();
    await expect(page.getByLabel("Followers and following")).toHaveText("0 followers · 0 following");
    await page.goto("/");
    await expect(page.getByText(words)).toHaveCount(0);
    await maker.context.close();
  });

  test("the owner sees who follows them, and manages whom they follow from their own list", async ({ page, browser, baseURL }) => {
    const me = newUser("listed");
    await signUpViaUi(page, me);
    const fan = await apiUser(browser, baseURL!, "fan");
    const idol = await apiUser(browser, baseURL!, "idol");
    expect((await fan.request.post(`/api/follows/${me.username}`)).status()).toBe(201);
    expect((await page.request.post(`/api/follows/${idol.user.username}`)).status()).toBe(201);

    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "1 follower" }).click();
    const followers = page.getByRole("region", { name: "Your followers" });
    await expect(followers.getByRole("link", { name: new RegExp(fan.user.username) })).toBeVisible();
    await expectReadable(page, "the list of followers");

    await page.getByRole("button", { name: "1 following" }).click();
    const following = page.getByRole("region", { name: "People you follow" });
    await following.getByRole("button", { name: new RegExp(`^Stop following ${idol.user.displayName}`) }).click();
    await expect(following.getByText(/You don't follow anyone yet/)).toBeVisible();
    await expect(page.getByLabel("Followers and following")).toHaveText("1 follower · 0 following");
    await fan.context.close();
    await idol.context.close();
  });

  test("no Follow button on a friend, on a private profile or on your own, and following a private profile is refused", async ({ page, browser, baseURL }) => {
    const me = newUser("choosy");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "pal");
    const hidden = await apiUser(browser, baseURL!, "hidden");
    await hidden.request.patch("/api/profiles/me", { data: { isPrivate: true } });
    await befriend(friend.request, page.request, friend.user.username);

    await page.goto(`/u/${friend.user.username}`);
    await expect(page.getByText("✓ Friends")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Follow / })).toHaveCount(0);
    await page.goto(`/u/${me.username}`);
    await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Follow / })).toHaveCount(0);

    const refused = await page.request.post(`/api/follows/${hidden.user.username}`);
    expect(refused.status()).toBe(404);
    expect((await refused.json()).error).toBe("That profile can't be followed");
    await friend.context.close();
    await hidden.context.close();
  });

  test("in Arabic the counts and the button read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "arabicmaker");
    await signUpViaUi(page, newUser("arabicfollower"));
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/u/${maker.user.username}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByLabel("المتابعون والمتابَعون")).toBeVisible();
    await page.getByRole("button", { name: /^متابعة / }).click();
    await expect(page.getByRole("button", { name: /^إلغاء متابعة / })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Arabic profile with Follow");
    await maker.context.close();
  });
});
