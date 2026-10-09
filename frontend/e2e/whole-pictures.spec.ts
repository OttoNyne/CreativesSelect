import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// pictures drawn in the page, so nothing is fetched: a tall one, a wide one and a landscape one for a wallpaper
const picture = (w: number, h: number) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#3a86ff"/><rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="#000" stroke-width="16"/></svg>`).toString("base64")}`;

test.describe("pictures are shown whole", () => {
  test("a tall and a wide picture on the feed keep their proportions and are not cut off", async ({ page }) => {
    await signUpViaUi(page, newUser("tall"));
    for (const [w, h] of [[600, 1400], [1600, 500]]) {
      // the server only keeps pictures it can name by address; an inline image is accepted for tests like this one
      const made = await page.request.post("/api/posts", { data: { content: `A ${w}x${h} picture`, imageUrl: picture(w, h) } });
      expect(made.status()).toBe(201);
    }
    await page.goto("/");
    const images = page.locator("img.object-contain");
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) {
      await expect(image).toBeVisible();
      expect(await image.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
      // what is drawn keeps the picture's own proportions: the fitted picture is never wider or taller than its box
      const fitted = await image.evaluate((el: HTMLImageElement) => {
        const box = el.getBoundingClientRect();
        const scale = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight);
        return { w: el.naturalWidth * scale, h: el.naturalHeight * scale, boxW: box.width, boxH: box.height };
      });
      expect(fitted.w).toBeLessThanOrEqual(fitted.boxW + 1);
      expect(fitted.h).toBeLessThanOrEqual(fitted.boxH + 1);
    }
  });

  test("a wallpaper is shown whole, fitted to the screen, with a blurred copy filling the rest, on the feed and the profile", async ({ page }) => {
    const me = newUser("wall");
    await signUpViaUi(page, me);
    const saved = await page.request.patch("/api/profiles/me", { data: { wallpaperUrl: picture(1600, 1000), wallpaperType: "image", wallpaperPosition: "50% 50%" } });
    expect(saved.status()).toBe(200);
    for (const path of ["/", `/u/${me.username}`]) {
      await page.goto(path);
      const whole = page.getByTestId("still-wallpaper-whole");
      await expect(whole).toHaveCount(1);
      expect(await whole.evaluate((el) => getComputedStyle(el).backgroundSize), path).toContain("contain");
      const layer = page.getByTestId("still-wallpaper");
      expect(await layer.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
      // the layer covers the whole screen, and does not grow with a long page (the way a fixed background did on iPhones)
      const box = await layer.boundingBox();
      const viewport = page.viewportSize()!;
      expect(Math.round(box!.width)).toBe(viewport.width);
      expect(Math.round(box!.height)).toBe(viewport.height);
    }
  });
});
