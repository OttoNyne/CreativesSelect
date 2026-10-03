import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

const PAGES = [
  { link: "About", path: "/about", heading: "About CreativesSelect", title: "About · CreativesSelect" },
  { link: "Features", path: "/features", heading: "Features", title: "Features · CreativesSelect" },
  { link: "How it works", path: "/how-it-works", heading: "How it works", title: "How it works · CreativesSelect" },
];

test.describe("the information pages", () => {
  test("a visitor who isn't signed in can read each one from the footer, and join from it", async ({ page }) => {
    await page.goto("/login");
    for (const p of PAGES) {
      await page.getByRole("navigation", { name: "About this site" }).getByRole("link", { name: p.link, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${p.path}$`));
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      await expect(page).toHaveTitle(p.title);
      await expectNoHorizontalOverflow(page); // fits the screen, phone included
      await page.goBack();
    }
    await page.goto("/about");
    await page.getByRole("link", { name: "Create your account" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("they are reachable straight from their addresses, without signing in", async ({ page }) => {
    for (const p of PAGES) {
      await page.goto(p.path);
      await expect(page).toHaveURL(new RegExp(`${p.path}$`)); // not bounced to the login page
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
    }
  });

  test("the footer is on every page and a signed-in person is offered their feed", async ({ page }) => {
    await signUpViaUi(page, newUser("reader"));
    await expect(page.getByRole("navigation", { name: "About this site" })).toBeVisible(); // on the feed too
    await page.getByRole("navigation", { name: "About this site" }).getByRole("link", { name: "Features" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Features" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create your account" })).toHaveCount(0);
    await page.getByRole("link", { name: "Go to your feed" }).click();
    await expect(page).toHaveURL("/");
  });

  test("the features page lists everything the site offers", async ({ page }) => {
    await page.goto("/features");
    for (const name of ["Portfolio", "Music", "Help wanted", "Live audio", "Privacy and safety"]) {
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(name) })).toBeVisible();
    }
    await page.goto("/how-it-works");
    await expect(page.getByRole("listitem")).toHaveCount(5);
  });
});
