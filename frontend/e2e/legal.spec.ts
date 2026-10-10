import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("policy pages, sign-up agreement and not-found page", () => {
  test("the three policy pages are one tap from the footer for someone who isn't signed in, and are readable and fit the screen", async ({ page }) => {
    await page.goto("/about");
    const footer = page.getByRole("navigation", { name: "About this site" });
    for (const [link, heading, title] of [
      ["Privacy", "Privacy Policy", "Privacy Policy · CreativesSelect"],
      ["Terms", "Terms of Use", "Terms of Use · CreativesSelect"],
      ["Community guidelines", "Community guidelines", "Community guidelines · CreativesSelect"],
    ] as const) {
      await footer.getByRole("link", { name: link, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page).toHaveTitle(title);
      await expect(page.getByText(/Last updated: /)).toBeVisible();
      await expect(page.getByText(/use the Report button on anything on the site/)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectReadable(page, `the ${heading} page`);
    }
  });

  test("signing up asks for the agreement first, links to the pages, and an account made with it works", async ({ page, context }) => {
    const me = newUser("agreer");
    await page.goto("/register");
    await page.getByPlaceholder("Display name").fill(me.displayName);
    await page.getByPlaceholder("Username").fill(me.username);
    await page.getByPlaceholder("Email").fill(me.email);
    await page.getByPlaceholder("Password (min 8 characters)").fill(me.password);

    // not agreed: the browser stops the form
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expectReadable(page, "the sign-up form with the agreement");

    // the links open the pages in a new tab, and the form is still as it was
    const [policy] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "Privacy Policy" }).click()]);
    await expect(policy.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await policy.close();
    await expect(page.getByPlaceholder("Username")).toHaveValue(me.username);

    await page.getByRole("checkbox", { name: /I'm at least 13/ }).check();
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/");

    // what they agreed to is on record (and in their data download)
    const data = await page.request.post("/api/profiles/me/export", { data: { password: me.password } });
    const exported = JSON.parse(await data.text());
    expect(exported.account.termsVersion).toBe("2026-10-10");
    expect(typeof exported.account.termsAcceptedAt).toBe("string");
  });

  test("an address that isn't a page says so, and the way home works", async ({ page }) => {
    await page.goto("/this-is-not-a-page");
    await expect(page.getByRole("heading", { level: 1, name: "That page isn't here" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("link", { name: "Go to the home page" }).click();
    await expect(page).toHaveURL(/\/login$/); // not signed in: the front door
  });

  test("in Arabic and Spanish the policy pages read in the language, mirrored for Arabic, and fit the screen", async ({ page }) => {
    await page.goto("/about");
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/privacy");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "سياسة الخصوصية" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Privacy Policy in Arabic");
    await page.goto("/register");
    await expect(page.getByRole("checkbox", { name: /عمري 13 عامًا/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.evaluate(() => localStorage.setItem("cs-language", "es"));
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Términos de uso" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Terms in Spanish");
    await page.goto("/guidelines");
    await expect(page.getByRole("heading", { level: 1, name: "Normas de la comunidad" })).toBeVisible();
  });
});
