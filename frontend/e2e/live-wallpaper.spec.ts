import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// A real (small) photo to use as the reference.
function samplePhoto() {
  const png = new PNG({ width: 96, height: 64 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 200;
    png.data[i + 1] = (i / 4) % 255;
    png.data[i + 2] = 90;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

const studio = (page: Page) => page.getByRole("region", { name: "AI wallpaper" });
const movingLayer = (page: Page) => page.getByTestId("moving-wallpaper");
const picture = (page: Page) => movingLayer(page).locator(".wallpaper-motion");
// The options are labels around visually hidden radio buttons, so they are picked the way a person does: by clicking the label.
const choose = (page: Page, label: string) =>
  studio(page)
    .locator("label")
    .filter({ hasText: new RegExp("^" + label + "$") })
    .click();

async function openStudio(page: Page, label: string) {
  const me = newUser(label);
  await signUpViaUi(page, me);
  await page.goto(`/u/${me.username}`);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await expect(studio(page)).toBeVisible();
  return me;
}

// Uses the wallpaper that was just made, and waits until the preview is gone and the profile itself shows it.
async function useIt(page: Page) {
  await studio(page).getByRole("button", { name: "Use this wallpaper" }).click();
  await expect(studio(page).getByRole("img", { name: "Your new wallpaper" })).toHaveCount(0);
  await expect(movingLayer(page)).toHaveCount(1);
}

async function generate(page: Page, description: string) {
  await studio(page).getByLabel(/What should it look like/).fill(description);
  await studio(page).getByRole("button", { name: /Generate live wallpaper|Try again/ }).click();
  await expect(studio(page).getByRole("img", { name: "Your new wallpaper" })).toBeVisible({ timeout: 30_000 });
}

test.describe("live wallpapers made with AI", () => {
  test("from a description: preview it moving, use it, and it plays behind the profile for everyone", async ({ page, browser, baseURL }) => {
    const me = await openStudio(page, "painter");
    await generate(page, "a rainy neon street at night");

    // a preview: it moves, but nothing has been saved yet
    await expect(studio(page).getByText("Made from your description.")).toBeVisible();
    await expect(studio(page).getByTestId("moving-wallpaper")).toHaveAttribute("data-motion", "zoom");
    expect((await (await page.request.get(`/api/profiles/${me.username}`)).json()).user.wallpaperUrl).toBeNull();

    await choose(page, "Drift");
    await useIt(page);

    // behind the whole page now, with the chosen motion, and actually animating
    await expect(movingLayer(page)).toHaveAttribute("data-motion", "drift");
    const style = await picture(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, state: s.animationPlayState, iterations: s.animationIterationCount };
    });
    expect(style).toEqual({ name: "wallpaper-drift", state: "running", iterations: "infinite" });

    // it was saved, and survives a reload
    const saved = (await (await page.request.get(`/api/profiles/${me.username}`)).json()).user;
    expect(saved).toMatchObject({ wallpaperType: "image", wallpaperMotion: "drift" });
    expect(saved.wallpaperUrl).toBeTruthy();
    await page.reload();
    await expect(movingLayer(page)).toHaveAttribute("data-motion", "drift");

    // and a visitor sees it too
    const visitor = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const vp = await visitor.newPage();
    await vp.goto(`/u/${me.username}`);
    await expect(vp.getByTestId("moving-wallpaper")).toHaveAttribute("data-motion", "drift");
    await expect(vp.getByRole("heading", { name: me.displayName })).toBeVisible();
    await visitor.close();
  });

  test("from a reference photo as well: the photo goes with the description, and the result reflects it", async ({ page }) => {
    await openStudio(page, "remixer");
    await generate(page, "a calm harbor at dusk");
    const plain = await studio(page).getByRole("img", { name: "Your new wallpaper" }).first().getAttribute("src");

    await studio(page).getByLabel("Reference photo").setInputFiles({ name: "my-harbor.png", mimeType: "image/png", buffer: samplePhoto() });
    await expect(studio(page).getByRole("img", { name: "Your reference photo" })).toBeVisible();
    await choose(page, "Just inspired by it");

    const request = page.waitForRequest((r) => r.url().endsWith("/api/ai/wallpaper") && r.method() === "POST");
    await studio(page).getByRole("button", { name: "✨ Try again" }).click();
    const sent = await request;
    expect(sent.headers()["content-type"]).toMatch(/^multipart\/form-data/); // the photo travels with the request, not as a link

    await expect(studio(page).getByText("Made from your photo and description.")).toBeVisible({ timeout: 30_000 });
    const withPhoto = await studio(page).getByRole("img", { name: "Your new wallpaper" }).first().getAttribute("src");
    expect(withPhoto).not.toBe(plain);
    expect(Buffer.from(withPhoto!.split(",")[1], "base64").toString()).toContain('data-reference="true"');

    await studio(page).getByRole("button", { name: "Remove photo" }).click();
    await expect(studio(page).getByText(/How closely should it follow/)).toHaveCount(0);
  });

  test("a result can be discarded, and a new description tried, without changing the profile", async ({ page }) => {
    const me = await openStudio(page, "chooser");
    await generate(page, "forest in mist");
    await studio(page).getByRole("button", { name: "Discard" }).click();
    await expect(studio(page).getByRole("img", { name: "Your new wallpaper" })).toHaveCount(0);
    await generate(page, "desert at noon");
    await studio(page).getByRole("button", { name: "Discard" }).click();
    expect((await (await page.request.get(`/api/profiles/${me.username}`)).json()).user.wallpaperUrl).toBeNull();
  });

  test("the motion of the wallpaper already there can be changed, and set to still", async ({ page }) => {
    const me = await openStudio(page, "mover");
    await generate(page, "aurora over a lake");
    await useIt(page);
    await expect(movingLayer(page)).toHaveAttribute("data-motion", "zoom");

    for (const [label, motion] of [["Pan", "pan"], ["Pulse", "pulse"]] as const) {
      await choose(page, label);
      await expect(movingLayer(page)).toHaveAttribute("data-motion", motion);
      await expect.poll(async () => (await (await page.request.get(`/api/profiles/${me.username}`)).json()).user.wallpaperMotion).toBe(motion);
    }

    await choose(page, "Still");
    await expect(page.getByTestId("moving-wallpaper")).toHaveCount(0);
    // a still wallpaper is the page's background again
    const bg = await page.locator("[data-wallpaper='true']").first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain("url(");
  });

  test("people who ask their device for less motion get a still picture", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStudio(page, "calm");
    await generate(page, "quiet beach");
    await useIt(page);
    expect(await picture(page).evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });

  test("text on top stays readable: the dark scrim covers the moving picture, and the page is flagged as a wallpaper page", async ({ page }) => {
    await openStudio(page, "readable");
    await generate(page, "bright white clouds");
    await useIt(page);
    const layer = movingLayer(page);
    const scrim = await layer.evaluate((el) => getComputedStyle(el.lastElementChild!).backgroundColor);
    expect(scrim).toBe("rgba(0, 0, 0, 0.55)");
    await expect(page.locator("[data-wallpaper='true']").first()).toHaveAttribute("data-scheme", "dark");
    // and the content is in front of the picture, not hidden behind it
    await expect(page.getByRole("button", { name: "Done editing" })).toBeVisible();
  });

  test("the studio fits the screen, phone included", async ({ page }) => {
    await openStudio(page, "fitter");
    await generate(page, "a mountain at sunrise");
    await expectNoHorizontalOverflow(page);
  });

  test("the moving picture never blocks the page: buttons in front of it are still clickable", async ({ page, browser, baseURL }) => {
    const owner = await apiUser(browser, baseURL!, "owner");
    expect((await owner.request.patch("/api/profiles/me", { data: { wallpaperUrl: "https://example.com/w.jpg", wallpaperType: "image", wallpaperMotion: "pan" } })).status()).toBe(200);
    await signUpViaUi(page, newUser("visitor"));
    await page.goto(`/u/${owner.user.username}`);
    await expect(page.getByTestId("moving-wallpaper")).toBeAttached();
    await page.getByRole("button", { name: "Add Friend" }).click();
    await expect(page.getByRole("button", { name: "Request sent" })).toBeVisible();
    await owner.context.close();
  });
});
