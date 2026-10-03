import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

const composer = (page: Page) => page.getByPlaceholder(/Share what you're working on/);

// The picture in the composer's preview, and in a finished post.
const previewImg = (page: Page) => page.getByTestId("adjust-preview").locator("img");
const postImg = (page: Page, text: string) => page.locator("article", { hasText: text }).locator("img[style*='object-position']");

async function attachGeneratedPicture(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole("button", { name: /Generate image with AI/ }).click();
  await expect(page.getByLabel("Zoom", { exact: true })).toBeVisible();
}

test.describe("adjusting a picture before posting", () => {
  test("shape, zoom and placement can be set, are previewed, and are kept on the post", async ({ page }) => {
    await signUpViaUi(page, newUser("framer"));
    await attachGeneratedPicture(page, "harbor at dusk");

    // Before anything is changed the position sliders have nothing to do.
    await expect(page.getByLabel("Move left or right")).toBeDisabled();

    await page.getByRole("button", { name: "Square" }).click();
    await page.getByLabel("Zoom", { exact: true }).fill("2");
    await page.getByLabel("Move left or right").fill("15");
    await page.getByLabel("Move up or down").fill("80");

    // The preview shows exactly that framing.
    await expect(previewImg(page)).toHaveCSS("transform", "matrix(2, 0, 0, 2, 0, 0)");
    await expect(previewImg(page)).toHaveCSS("object-position", "15% 80%");
    expect(await previewImg(page).evaluate((el) => getComputedStyle(el.parentElement!).aspectRatio)).toBe("1 / 1");

    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByLabel("Zoom", { exact: true })).toHaveCount(0); // composer cleared itself

    // The post shows the same framing, and it survives a reload (it was really saved).
    for (const step of ["after posting", "after a reload"]) {
      if (step === "after a reload") await page.reload();
      const img = postImg(page, "harbor at dusk");
      await expect(img, step).toHaveCSS("transform", "matrix(2, 0, 0, 2, 0, 0)");
      await expect(img, step).toHaveCSS("object-position", "15% 80%");
      expect(await img.evaluate((el) => getComputedStyle(el.parentElement!).aspectRatio), step).toBe("1 / 1");
    }
  });

  test("dragging the picture moves it, and Reset puts it back", async ({ page }) => {
    await signUpViaUi(page, newUser("dragger"));
    await attachGeneratedPicture(page, "a study in blue");
    await page.getByRole("button", { name: "Wide" }).click();
    await page.getByLabel("Zoom", { exact: true }).fill("2.5");
    await page.getByLabel("Move left or right").fill("60");

    const frame = page.getByTestId("adjust-preview");
    const box = (await frame.boundingBox())!;
    const slider = page.getByLabel("Move left or right");
    const before = Number(await slider.inputValue());
    // dragging the picture to the right shows more of its left side, so the position goes down
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(Number(await slider.inputValue())).toBeLessThan(before);

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(slider).toBeDisabled();
    await expect(page.getByLabel("Zoom", { exact: true })).toHaveValue("1");
    await expect(previewImg(page)).toHaveCSS("object-position", "50% 50%");
  });

  test("a picture left alone is posted as it always was: whole, uncropped", async ({ page }) => {
    await signUpViaUi(page, newUser("plain"));
    await attachGeneratedPicture(page, "no changes here");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const img = postImg(page, "no changes here");
    await expect(img).toBeVisible();
    await expect(img).toHaveCSS("transform", "none");
    expect(await img.evaluate((el) => getComputedStyle(el.parentElement!).aspectRatio)).toBe("auto");
  });

  test("a picture can be removed before posting, and the next one starts fresh", async ({ page }) => {
    await signUpViaUi(page, newUser("undo"));
    await attachGeneratedPicture(page, "first try");
    await page.getByLabel("Zoom", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Remove picture" }).click();
    await expect(page.getByLabel("Zoom", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /Generate image with AI/ }).click();
    await expect(page.getByLabel("Zoom", { exact: true })).toHaveValue("1");
  });
});
