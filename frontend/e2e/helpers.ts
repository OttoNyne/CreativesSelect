import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

export const PASSWORD = "E2e-password-1";

export interface TestUser {
  username: string;
  displayName: string;
  email: string;
  password: string;
}

// Unique per call, so tests never collide with each other or with earlier runs.
export function newUser(label = "user"): TestUser {
  const id = randomBytes(4).toString("hex");
  const username = `${label}_${id}`.toLowerCase().slice(0, 30);
  return { username, displayName: `${label[0].toUpperCase()}${label.slice(1)} ${id}`, email: `${username}@example.com`, password: PASSWORD };
}

// The API rate-limits registration per client IP (10 an hour). Every test
// registers several people, so each one claims to arrive from its own address.
// The API reads the real client IP from `x-vercel-forwarded-for` (set by the
// production proxy); sending it ourselves is what makes each test independent.
export function fakeIpHeaders(): Record<string, string> {
  const b = randomBytes(3);
  return { "x-vercel-forwarded-for": `198.51.${b[0]}.${b[1] || 1}` };
}

// Sign up through the real form; ends on the feed, signed in.
export async function signUpViaUi(page: Page, user: TestUser) {
  await page.goto("/register");
  await page.getByPlaceholder("Display name").fill(user.displayName);
  await page.getByPlaceholder("Username").fill(user.username);
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password (min 8 characters)").fill(user.password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByPlaceholder(/Share what you're working on/)).toBeVisible();
}

export async function logInViaUi(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
}

// Create an account through the API in a fresh, separate browser session (so a
// test can act as a second person). Returns the request context, already
// signed in as that user.
export async function apiUser(browser: Browser, baseURL: string, label = "friend") {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
  const user = newUser(label);
  const res = await context.request.post("/api/auth/register", {
    data: { username: user.username, email: user.email, password: user.password, displayName: user.displayName },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return { user, id: body.user.id as string, context, request: context.request as APIRequestContext };
}

// A second person using the site in a real page of their own.
export async function secondBrowserUser(browser: Browser, baseURL: string, label = "other") {
  const context: BrowserContext = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
  const page = await context.newPage();
  const user = newUser(label);
  await signUpViaUi(page, user);
  return { user, context, page };
}

// On a phone the links live behind the ☰ button.
export async function logOut(page: Page) {
  const menu = page.getByRole("button", { name: "Menu" });
  const logout = page.getByRole("button", { name: "Log out" });
  // Right after a page load the navbar is still checking the session; wait until
  // it shows either the phone menu button or the desktop Log out button.
  await expect(menu.or(logout).first()).toBeVisible();
  if (await menu.isVisible()) await menu.click();
  await logout.click();
  await expect(page).toHaveURL(/\/login$/);
}

// Make a and b friends (b sends, a accepts) through the API.
export async function befriend(a: APIRequestContext, b: APIRequestContext, aUsername: string) {
  const sent = await b.post(`/api/friends/request/${aUsername}`);
  expect(sent.status()).toBe(201);
  const { friendship } = await sent.json();
  const accepted = await a.post(`/api/friends/accept/${friendship._id}`);
  expect(accepted.status()).toBe(200);
}

// No sideways scrolling: the page must fit the viewport width.
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(1);
}
