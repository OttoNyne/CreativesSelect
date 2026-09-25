import { expect, test } from "@playwright/test";
import { apiUser, fakeIpHeaders, logInViaUi, logOut, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

test.describe("signing up, in and out", () => {
  test("signed-out visitors are sent to the login page for protected pages", async ({ page }) => {
    await page.goto("/help-wanted");
    await expect(page).toHaveURL(/\/login$/);
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Sign up" })).toBeVisible();

    await page.goto("/friends");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sign up → still signed in after a reload → log out → log back in", async ({ page }) => {
    const user = newUser("sam");
    await signUpViaUi(page, user);
    await expect(page).toHaveTitle(/Feed · CreativesSelect/);

    // The session must survive a full page reload. On WebKit/iOS this is the check
    // that fails if the login cookie isn't first-party.
    await page.reload();
    await expect(page.getByPlaceholder(/Share what you're working on/)).toBeVisible();
    await page.goto("/help-wanted");
    await expect(page).toHaveURL(/\/help-wanted$/);

    await logOut(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/); // really signed out

    await logInViaUi(page, user);
    await expect(page).toHaveURL("/");
    await expect(page.getByPlaceholder(/Share what you're working on/)).toBeVisible();
  });

  test("a wrong password shows an error and keeps you on the login page", async ({ page, browser, baseURL }) => {
    const other = await apiUser(browser, baseURL!, "login");
    await logInViaUi(page, { email: other.user.email, password: "definitely-wrong-1" });
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await other.context.close();
  });

  test("the sign-up form explains and enforces the username rule", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText(/3–30 letters, numbers or underscores/)).toBeVisible();

    await page.getByPlaceholder("Display name").fill("Bad Name");
    await page.getByPlaceholder("Username").fill("bad.name");
    await page.getByPlaceholder("Email").fill("bad@example.com");
    await page.getByPlaceholder("Password (min 8 characters)").fill("long-enough-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/register$/); // the browser refused to submit
  });

  test("signing up with an email that's already registered says so", async ({ page, browser, baseURL }) => {
    const existing = await apiUser(browser, baseURL!, "taken");
    await page.goto("/register");
    await page.getByPlaceholder("Display name").fill("Copycat");
    await page.getByPlaceholder("Username").fill(newUser("copy").username);
    await page.getByPlaceholder("Email").fill(existing.user.email);
    await page.getByPlaceholder("Password (min 8 characters)").fill("long-enough-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Email or username already taken")).toBeVisible();
    await existing.context.close();
  });

  test("each page sets a meaningful tab title, and the app is installable", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("Log in · CreativesSelect");
    await page.goto("/register");
    await expect(page).toHaveTitle("Sign up · CreativesSelect");

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).display).toBe("standalone");
  });
});
