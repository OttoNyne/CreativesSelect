import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

function samplePhoto() {
  const png = new PNG({ width: 96, height: 64 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 30;
    png.data[i + 1] = (i / 4) % 255;
    png.data[i + 2] = 200;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}
const decoded = (src: string) => Buffer.from(src.split(",")[1], "base64").toString();

const composer = (page: Page) => page.getByPlaceholder(/Share what you're working on/);
const preview = (page: Page) => page.getByTestId("adjust-preview").locator("img");

test.describe("AI pictures from a reference photo, wherever the site makes AI pictures", () => {
  test("in a new post: the photo goes with the description and the picture is made from it", async ({ page }) => {
    await signUpViaUi(page, newUser("poster"));
    await composer(page).fill("a kite over the sea");

    // from words alone, as always
    await page.getByRole("button", { name: /Generate image with AI/ }).click();
    await expect(preview(page)).toBeVisible();
    const plain = await preview(page).getAttribute("src");
    expect(decoded(plain!)).not.toContain("data-reference");

    // now from a photo
    await page.getByRole("button", { name: "📷 Start from a photo" }).click();
    await page.getByLabel("Reference photo").setInputFiles({ name: "my-kite.png", mimeType: "image/png", buffer: samplePhoto() });
    await expect(page.getByRole("img", { name: "Your reference photo" })).toBeVisible();
    await page.locator("label").filter({ hasText: /^Just inspired by it$/ }).click();

    const request = page.waitForRequest((r) => r.url().endsWith("/api/ai/image") && r.method() === "POST");
    await page.getByRole("button", { name: /Generate image with AI/ }).click();
    expect((await request).headers()["content-type"]).toMatch(/^multipart\/form-data/);

    await expect(preview(page)).not.toHaveAttribute("src", plain!);
    await expect.poll(async () => decoded((await preview(page).getAttribute("src"))!)).toContain('data-reference="true"');

    // and it posts like any other picture
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const posted = page.locator("article", { hasText: "a kite over the sea" }).locator("img[style*='object-position']");
    await expect(posted).toBeVisible();
    expect(decoded((await posted.getAttribute("src"))!)).toContain('data-reference="true"');
  });

  test("on the portfolio: add a picture made from a photo", async ({ page }) => {
    const me = newUser("artist");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    await page.getByPlaceholder("Describe an image to generate…").fill("a lighthouse in a storm");
    await page.getByRole("button", { name: "📷 Start from a photo" }).click();
    await page.getByLabel("Reference photo").setInputFiles({ name: "lighthouse.png", mimeType: "image/png", buffer: samplePhoto() });
    await page.getByRole("button", { name: "🖼️ Generate", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove from portfolio" })).toBeVisible({ timeout: 30_000 });
    const saved = (await (await page.request.get(`/api/media/user/${me.username}`)).json()).media as { url: string }[];
    expect(saved).toHaveLength(1);
    expect(decoded(saved[0].url)).toContain('data-reference="true"');
  });

  test("the wallpaper studio still works the same way", async ({ page }) => {
    const me = newUser("walls");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const studio = page.getByRole("region", { name: "AI wallpaper" });
    await studio.getByLabel(/What should it look like/).fill("aurora");
    await studio.getByLabel("Reference photo").setInputFiles({ name: "sky.png", mimeType: "image/png", buffer: samplePhoto() });
    await expect(studio.getByRole("img", { name: "Your reference photo" })).toBeVisible();
    await studio.getByRole("button", { name: /Generate live wallpaper/ }).click();
    await expect(studio.getByText("Made from your photo and description.")).toBeVisible({ timeout: 30_000 });
  });

  test("a file that isn't a picture is turned away without sending anything", async ({ page }) => {
    await signUpViaUi(page, newUser("careful"));
    await composer(page).fill("a kite");
    await page.getByRole("button", { name: "📷 Start from a photo" }).click();
    let sent = false;
    page.on("request", (r) => (sent ||= r.url().endsWith("/api/ai/image")));
    await page.getByLabel("Reference photo").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture") });
    await expect(page.getByRole("alert").filter({ hasText: "Choose a picture" })).toBeVisible();
    expect(sent).toBe(false);
  });

  test("the photo options fit the screen, phone included", async ({ page }) => {
    await signUpViaUi(page, newUser("fits"));
    await composer(page).fill("a kite");
    await page.getByRole("button", { name: "📷 Start from a photo" }).click();
    await page.getByLabel("Reference photo").setInputFiles({ name: "k.png", mimeType: "image/png", buffer: samplePhoto() });
    await expect(page.getByText(/How closely should it follow/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
