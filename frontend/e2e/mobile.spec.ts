import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// Only meaningful at phone size (the "iphone" project); the desktop projects skip these.
test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout only");

  test("signed-out pages fit the screen", async ({ page }) => {
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("the ☰ menu reaches every page and every page fits the screen", async ({ page }) => {
    const user = newUser("phone");
    await signUpViaUi(page, user);
    await expectNoHorizontalOverflow(page);

    const menu = page.getByRole("button", { name: "Menu" });
    await expect(menu).toBeVisible();
    for (const [label, url] of [["Friends", /\/friends$/], ["Groups", /\/groups$/], ["Search", /\/search$/], ["Help wanted", /\/help-wanted$/], ["Feed", /\/$/]] as const) {
      await menu.click();
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(menu).toHaveAttribute("aria-expanded", "false"); // closes after choosing
      await expectNoHorizontalOverflow(page);
    }

    await page.goto(`/u/${user.username}`);
    await expect(page.getByRole("heading", { name: user.displayName })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByRole("button", { name: "Change username" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("controls that used to need hover work by touch", async ({ page }) => {
    const user = newUser("touch");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByPlaceholder("Describe an image to generate…").fill("a paper boat");
    await page.getByRole("button", { name: "🖼️ Generate", exact: true }).click();
    const remove = page.getByRole("button", { name: "Remove from portfolio" });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24); // big enough to tap
    expect(box!.height).toBeGreaterThanOrEqual(24);
    await page.getByRole("button", { name: "Add a reaction" }).tap();
    await page.getByRole("group", { name: "Pick a reaction" }).getByRole("button", { name: "Love", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Love: 1, your reaction" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the box for describing an image to generate in the portfolio takes the width of the screen, with its buttons under it", async ({ page }) => {
    const user = newUser("describer");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}#portfolio`);
    const box = page.getByLabel("Describe an image to generate…");
    await expect(box).toBeVisible();
    const field = await box.boundingBox();
    const viewport = page.viewportSize()!;
    expect(field!.width, "the box was squeezed by the buttons beside it").toBeGreaterThan(viewport.width * 0.7);
    const generate = await page.getByRole("button", { name: /Generate$/ }).boundingBox();
    expect(generate!.y, "the buttons sit under the box").toBeGreaterThan(field!.y + field!.height - 1);
    await page.getByRole("button", { name: "Start from a photo" }).first().tap();
    await expectNoHorizontalOverflow(page);
  });
});
