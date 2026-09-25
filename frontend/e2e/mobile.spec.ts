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
    await page.getByRole("button", { name: "Like", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});
