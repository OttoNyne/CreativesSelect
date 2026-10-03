import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, fakeIpHeaders } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

test.describe("the 'add to Home Screen' banner", () => {
  test("iPhone visitors are shown how to install the site, can dismiss it, and it stays dismissed", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "only shown on iPhones and iPads");
    await page.goto("/login");
    const banner = page.getByRole("region", { name: "Install the app" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Add to Home Screen");
    await expectNoHorizontalOverflow(page); // fits the phone's width

    const dismiss = banner.getByRole("button", { name: "Dismiss" });
    const box = (await dismiss.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
    await dismiss.tap();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: /Log in/ })).toBeVisible();
    await expect(banner).toHaveCount(0); // remembered
  });

  test("computers don't see it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "iphone", "iPhones are meant to see it");
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Log in/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Install the app" })).toHaveCount(0);
  });
});
