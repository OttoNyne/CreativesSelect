import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";
import { scanQr } from "../src/test/scanQr";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// Reads the code on screen the way a phone's camera would, and returns the address it holds.
async function scannedAddress(page: Page) {
  const qr = page.getByTestId("share-qr");
  await expect(qr).toBeVisible();
  const src = await qr.getAttribute("src");
  const address = scanQr(src!);
  expect(address, "the QR code on screen can't be read").not.toBeNull();
  return address!;
}

test.describe("sharing the site with a QR code", () => {
  test("anyone can open the share window from the footer, scan the code and land on the site", async ({ page, baseURL, browser }) => {
    await page.goto("/about");
    await page.getByRole("button", { name: "Share this site" }).click();
    const dialog = page.getByRole("dialog", { name: "Share CreativesSelect" });
    await expect(dialog).toBeVisible();

    const address = await scannedAddress(page);
    expect(address).toBe(baseURL); // (on the live site this is the real domain)
    await expect(dialog.getByLabel("Link")).toHaveValue(address);

    // "Scanning" it: a different person opening that address gets the site.
    const other = await browser.newContext();
    const visitor = await other.newPage();
    await visitor.goto(address);
    await expect(visitor.getByRole("heading", { name: /Welcome back|Log in|Join CreativesSelect/ }).first()).toBeVisible();
    await other.close();

    // closing it puts focus back on the button
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share this site" })).toBeFocused();
  });

  test("the window can be saved as a picture and fits the screen, phone included", async ({ page }) => {
    await page.goto("/features");
    await page.getByRole("button", { name: "Share this site" }).click();
    await expect(page.getByRole("link", { name: "Save QR code" })).toHaveAttribute("download", "creativesselect-qr.png");
    const box = await page.getByRole("dialog").boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });

  test("a profile has its own code, which opens that profile, even on a light-coloured profile", async ({ page, baseURL }, testInfo) => {
    const me = newUser("sharer");
    await signUpViaUi(page, me);
    expect((await page.request.patch("/api/profiles/me", { data: { theme: { bgColor: "#ffffff", textColor: "#111111" } } })).status()).toBe(200);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Share your profile" });
    await expect(dialog).toBeVisible();
    expect(await scannedAddress(page)).toBe(`${baseURL}/p/${me.username}`); // by way of the preview page, which sends people on to the profile

    // the window keeps its own (dark) colours instead of inheriting the profile's light ones
    const colours = await dialog.evaluate((el) => ({ text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    expect(colours.text).toBe("rgb(255, 255, 255)");
    expect(colours.background).not.toBe("rgb(255, 255, 255)");
    if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("share-on-light-profile.png") });
  });

  test("on a phone it is in the menu", async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, "the menu is the phone layout");
    await signUpViaUi(page, newUser("phone"));
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Share this site" }).first().click();
    expect(await scannedAddress(page)).toBe(baseURL);
  });
});
