import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { apiUser, befriend, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;
// a word nobody else's test uses, so muting it hides only this test's posts
const word = () => `zq${randomBytes(3).toString("hex").replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)])}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

async function openSettings(page: Page, username: string) {
  await page.goto(`/u/${username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByRole("region", { name: /Muting|الكتم/ }).scrollIntoViewIfNeeded();
}

test.describe("muting", () => {
  test("someone is muted from their profile: their posts leave the feed, the list in settings can unmute them, and nothing else changes", async ({ page, browser, baseURL }) => {
    const me = newUser("muter");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "chatty");
    await befriend(page.request, friend.request, me.username);
    const loud = unique("Loud post from the friend");
    expect((await friend.request.post("/api/posts", { data: { content: loud } })).status()).toBe(201);

    await page.goto("/");
    await expect(page.getByText(loud)).toBeVisible();

    await page.goto(`/u/${friend.user.username}`);
    await page.getByRole("button", { name: new RegExp(`^Mute ${friend.user.displayName}`) }).click();
    await expect(page.getByRole("button", { name: `Unmute ${friend.user.displayName}` })).toHaveAttribute("aria-pressed", "true");
    await expectNoHorizontalOverflow(page);
    // still friends: the profile is there; but the feed no longer has them
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Add a poll" })).toBeVisible();
    await expect(page.getByText(loud)).toHaveCount(0);

    // listed in settings, and unmuting brings them back
    await openSettings(page, me.username);
    const muting = page.getByRole("region", { name: "Muting" });
    await expect(muting.getByRole("link", { name: new RegExp(friend.user.displayName) })).toBeVisible();
    await expectReadable(page, "the muting settings");
    await muting.getByRole("button", { name: `Unmute ${friend.user.displayName}` }).click();
    await expect(muting.getByText("You haven't muted anyone.")).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(loud)).toBeVisible();
    await friend.context.close();
  });

  test("muted words hide the posts that use them, as whole words, until they are taken off the list", async ({ page, browser, baseURL }) => {
    const me = newUser("wordy");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "talker");
    await befriend(page.request, friend.request, me.username);
    const w = word();
    const hidden = unique(`Thoughts on ${w} today`);
    const alike = unique(`The ${w}ish kind`);
    const other = unique("Something else entirely");
    for (const content of [hidden, alike, other]) expect((await friend.request.post("/api/posts", { data: { content } })).status()).toBe(201);

    await openSettings(page, me.username);
    const muting = page.getByRole("region", { name: "Muting" });
    await muting.getByRole("textbox", { name: "A word or phrase to mute" }).fill(w.toUpperCase());
    await muting.getByRole("button", { name: "Mute word" }).click();
    await expect(muting.getByText(w, { exact: true })).toBeVisible(); // kept in lower case
    await expectNoHorizontalOverflow(page);

    await page.goto("/");
    await expect(page.getByText(other)).toBeVisible();
    await expect(page.getByText(alike)).toBeVisible(); // not the whole word
    await expect(page.getByText(hidden)).toHaveCount(0);

    await openSettings(page, me.username);
    await page.getByRole("region", { name: "Muting" }).getByRole("button", { name: `Stop muting ${w}` }).click();
    await expect(page.getByRole("region", { name: "Muting" }).getByText("No muted words.")).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(hidden)).toBeVisible();
    await friend.context.close();
  });

  test("a muted person is left out of Explore, and their notices out of the bell", async ({ page, browser, baseURL }) => {
    const me = newUser("quiet");
    await signUpViaUi(page, me);
    const noisy = await apiUser(browser, baseURL!, "noisy");
    const tag = word();
    const mine = unique(`My post #${tag}`);
    const theirs = unique(`Their post #${tag}`);
    const post = (await (await page.request.post("/api/posts", { data: { content: mine } })).json()).post;
    expect((await noisy.request.post("/api/posts", { data: { content: theirs } })).status()).toBe(201);
    expect((await noisy.request.post(`/api/posts/${post.id}/comments`, { data: { content: "Noisy comment" } })).status()).toBe(201);

    await page.goto(`/explore?tag=${tag}`);
    await expect(page.getByText(theirs)).toBeVisible();
    expect((await page.request.put(`/api/mutes/people/${noisy.user.username}`)).status()).toBe(201);
    await page.goto(`/explore?tag=${tag}`);
    await expect(page.getByText(mine)).toBeVisible();
    await expect(page.getByText(theirs)).toHaveCount(0);

    const notices = (await (await page.request.get("/api/notifications")).json()).notifications as { type: string }[];
    expect(notices.some((n) => n.type === "comment")).toBe(false);
    await noisy.context.close();
  });

  test("in Arabic the muting settings and the Mute button read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    const me = newUser("arabicmuter");
    await signUpViaUi(page, me);
    const other = await apiUser(browser, baseURL!, "someone");
    await page.request.put(`/api/mutes/people/${other.user.username}`);
    await page.request.put("/api/mutes/words", { data: { words: ["مسلسل", "spoilers"] } });
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/u/${other.user.username}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: new RegExp(`^إلغاء كتم ${other.user.displayName}`) })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "تعديل الملف الشخصي" }).click();
    const muting = page.getByRole("region", { name: "الكتم" });
    await muting.scrollIntoViewIfNeeded();
    await expect(muting.getByText("مسلسل")).toBeVisible();
    await expect(muting.getByRole("link", { name: new RegExp(other.user.displayName) })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the muting settings in Arabic");
    await other.context.close();
  });
});
