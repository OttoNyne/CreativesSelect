import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// A 1×1 picture, enough to be a portfolio piece.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const tile = (page: Page, text: string) => page.locator('[id^="piece-"]').filter({ hasText: text });

async function ownProfile(page: Page, label: string) {
  const user = newUser(label);
  await signUpViaUi(page, user);
  return user;
}

test.describe("captions on portfolio photos", () => {
  test("an owner writes a caption before adding a photo, adds one to a photo without, changes it and takes it off", async ({ page, browser, baseURL }) => {
    const owner = await ownProfile(page, "captioner");
    // one piece with no caption, added the plain way
    expect((await page.request.post("/api/media", { data: { type: "image", url: PIXEL } })).status()).toBe(201);
    await page.goto(`/u/${owner.username}`);
    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();

    // a caption written first goes with the next picture added (here a generated one)
    await page.getByLabel("Caption for the next piece").fill("Kite over the hills");
    await page.getByPlaceholder("Describe an image to generate…").fill("a red kite over hills");
    await page.getByRole("button", { name: "🖼️ Generate", exact: true }).click();
    await expect(page.getByText("Kite over the hills")).toBeVisible();
    await expect(page.getByLabel("Caption for the next piece")).toHaveValue(""); // ready for the next one

    // the piece with none gets one
    const bare = page.getByRole("button", { name: "Add a caption" });
    await expect(bare).toHaveCount(1);
    await bare.click();
    await page.getByLabel("Caption", { exact: true }).fill("First light");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("First light")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a caption" })).toHaveCount(0);

    // change one
    await tile(page, "First light").getByRole("button", { name: "Edit caption" }).click();
    await page.getByLabel("Caption", { exact: true }).fill("Last light");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Last light")).toBeVisible();
    await expect(page.getByText("First light")).toHaveCount(0);

    // it is what a visitor sees, signed out, with no way to change it
    const visitor = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const vpage = await visitor.newPage();
    await vpage.goto(`/u/${owner.username}`);
    await expect(vpage.getByText("Last light")).toBeVisible();
    await expect(vpage.getByText("Kite over the hills")).toBeVisible();
    await expect(vpage.getByRole("button", { name: /caption/i })).toHaveCount(0);
    await expect(vpage.locator('img[alt="Last light"]')).toHaveCount(1); // the words are the picture's description for screen readers too

    // take one off by saving it empty; it stays off after a reload
    await tile(page, "Kite over the hills").getByRole("button", { name: "Edit caption" }).click();
    await page.getByLabel("Caption", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add a caption" })).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a caption" })).toHaveCount(1);
    await visitor.close();
  });

  test("a caption can't be longer than 200 characters, in the box or at the server", async ({ page }) => {
    const owner = await ownProfile(page, "wordy");
    const created = await (await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: "short" } })).json();
    await page.goto(`/u/${owner.username}`);
    await page.getByRole("button", { name: "Edit caption" }).click();
    await page.getByLabel("Caption", { exact: true }).fill("x".repeat(250));
    await expect(page.getByText("200/200")).toBeVisible(); // the box stops at 200
    expect((await page.request.patch(`/api/media/${created.mediaItem.id}`, { data: { caption: "y".repeat(201) } })).status()).toBe(400);
    expect((await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: "z".repeat(201) } })).status()).toBe(400);
  });

  test("nobody else can change your caption", async ({ page, browser, baseURL }) => {
    const owner = await ownProfile(page, "mine");
    const created = await (await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: "Mine" } })).json();
    const other = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const them = newUser("intruder");
    expect((await other.request.post("/api/auth/register", { data: { username: them.username, email: them.email, password: them.password, displayName: them.displayName } })).status()).toBe(201);
    expect((await other.request.patch(`/api/media/${created.mediaItem.id}`, { data: { caption: "Taken over" } })).status()).toBe(404);
    await page.goto(`/u/${owner.username}`);
    await expect(page.getByText("Mine", { exact: true })).toBeVisible();
    await other.close();
  });
});
