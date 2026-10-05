import { expect, test, type Page } from "@playwright/test";
import { apiUser, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// A real YouTube video id is 11 characters; the player isn't started in these tests.
async function addTracks(page: Page, titles: string[]) {
  for (const [i, title] of titles.entries()) {
    const res = await page.request.post("/api/tracks", { data: { title, sourceType: "youtube", url: `dQw4w9WgXc${i}` } });
    expect(res.status(), title).toBe(201);
  }
}
const rows = (page: Page) => page.getByTestId("track-row");
const order = async (page: Page) => rows(page).locator("p.truncate").allTextContents();
const savedOrder = async (page: Page, username: string) => ((await (await page.request.get(`/api/profiles/${username}/tracks`)).json()).tracks as { title: string }[]).map((t) => t.title);

async function openPlaylist(page: Page, titles: string[]) {
  const me = newUser("dj");
  await signUpViaUi(page, me);
  await addTracks(page, titles);
  await page.goto(`/u/${me.username}`);
  await expect(rows(page)).toHaveCount(titles.length);
  return me;
}

test.describe("rearranging the music on a profile", () => {
  test("songs move up and down with the buttons, and the order is kept", async ({ page }) => {
    const me = await openPlaylist(page, ["Sunrise", "Midday", "Sunset"]);
    expect(await order(page)).toEqual(["Sunrise", "Midday", "Sunset"]);
    await expect(page.getByRole("button", { name: "Move Sunrise up" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move Sunset down" })).toBeDisabled();

    await page.getByRole("button", { name: "Move Sunset up" }).click();
    expect(await order(page)).toEqual(["Sunrise", "Sunset", "Midday"]); // shown at once
    await expect.poll(() => savedOrder(page, me.username)).toEqual(["Sunrise", "Sunset", "Midday"]);

    await page.getByRole("button", { name: "Move Sunrise down" }).click();
    await expect.poll(() => savedOrder(page, me.username)).toEqual(["Sunset", "Sunrise", "Midday"]);

    await page.reload();
    await expect(rows(page)).toHaveCount(3);
    expect(await order(page)).toEqual(["Sunset", "Sunrise", "Midday"]);
  });

  test("visitors hear them in the owner's order, and have no controls", async ({ page, browser, baseURL }) => {
    const me = await openPlaylist(page, ["One", "Two", "Three"]);
    await page.getByRole("button", { name: "Move Three up" }).click();
    await page.getByRole("button", { name: "Move Three up" }).click();
    await expect.poll(() => savedOrder(page, me.username)).toEqual(["Three", "One", "Two"]);

    const visitor = await apiUser(browser, baseURL!, "listener");
    const vp = await visitor.context.newPage();
    await vp.goto(`/u/${me.username}`);
    await expect(vp.getByTestId("track-row")).toHaveCount(3);
    expect(await vp.getByTestId("track-row").locator("p.truncate").allTextContents()).toEqual(["Three", "One", "Two"]);
    await expect(vp.getByRole("button", { name: /^Move / })).toHaveCount(0);
    await visitor.context.close();
  });

  test("a song can be dragged to a new place", async ({ page, isMobile }) => {
    test.skip(isMobile, "dragging is for mouse users; phones use the buttons");
    const me = await openPlaylist(page, ["Alpha", "Bravo", "Charlie"]);
    // the music sits below the About me section, so bring all three songs into the middle of the screen before dragging
    await rows(page).nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await rows(page).nth(0).dragTo(rows(page).nth(2));
    await expect.poll(() => savedOrder(page, me.username)).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(await order(page)).toEqual(["Bravo", "Charlie", "Alpha"]);
  });

  test("removing a song after rearranging keeps the rest in the new order", async ({ page }) => {
    const me = await openPlaylist(page, ["A song", "B song", "C song"]);
    await page.getByRole("button", { name: "Move C song up" }).click();
    await page.getByRole("button", { name: "Move C song up" }).click();
    await expect.poll(() => savedOrder(page, me.username)).toEqual(["C song", "A song", "B song"]);
    await page.getByRole("button", { name: "Remove A song" }).click();
    await expect(rows(page)).toHaveCount(2);
    expect(await order(page)).toEqual(["C song", "B song"]);
    await expect.poll(() => savedOrder(page, me.username)).toEqual(["C song", "B song"]);
  });

  test("the controls fit on a phone-sized screen", async ({ page }) => {
    await openPlaylist(page, ["A rather long song title that goes on and on", "Short", "Another quite long song title here"]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
