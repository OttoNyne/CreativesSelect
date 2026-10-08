import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

test.describe("shareable profiles", () => {
  test("a shared link has a preview for messages and social media, and opens the real profile for a person", async ({ page, browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "sharer");
    await maker.request.patch("/api/profiles/me", { data: { bio: "I make <b>pots</b> & jugs" } });

    // what a program that makes previews reads (the same address Share gives out)
    const res = await page.request.get(`/p/${maker.user.username}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`property="og:title" content="${maker.user.displayName} (@${maker.user.username}) · CreativesSelect"`);
    expect(html).toContain("I make &lt;b&gt;pots&lt;/b&gt; &amp; jugs");
    expect(html).toContain("noindex"); // not listed unless the owner says so

    // a person who opens it ends up on the profile, not on a blank page
    await page.goto(`/p/${maker.user.username}`);
    await expect(page).toHaveURL(new RegExp(`/u/${maker.user.username}$`));
    await expect(page.getByRole("heading", { name: maker.user.displayName })).toBeVisible();
    await maker.context.close();
  });

  test("someone who isn't signed in can look, is invited to join, and the page is kept out of search engines", async ({ page, browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "visible");
    await page.goto(`/u/${maker.user.username}`);
    await expect(page.getByRole("heading", { name: maker.user.displayName })).toBeVisible();
    await expect(page.getByText(/Join CreativesSelect to add/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" }).first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
    await expectNoHorizontalOverflow(page);
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    await maker.context.close();
  });

  test("an owner who allows search engines is listed in the sitemap, the preview stops saying noindex, and switching off takes them out", async ({ page, request }) => {
    const me = newUser("listed");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/u/${me.username}<`);

    await page.getByRole("button", { name: "Edit profile" }).click();
    const box = page.getByRole("checkbox", { name: "Let search engines like Google list my profile" });
    await box.click(); // saved straight away
    await expect(box).toBeChecked();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index,follow");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.headers()["content-type"]).toContain("xml");
    expect(await sitemap.text()).toContain(`/u/${me.username}<`);
    const preview = await (await request.get(`/p/${me.username}`)).text();
    expect(preview).toContain('content="index,follow"');

    await box.click();
    await expect(box).not.toBeChecked();
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/u/${me.username}<`);
  });

  test("addresses that only start with a p still open the app, not the preview page", async ({ page }) => {
    for (const path of ["/posts/abc", "/profile-anything", "/p/two/parts"]) {
      const html = await (await page.request.get(path)).text();
      expect(html, path).toContain('id="root"');
    }
  });

  test("a private profile's preview shows nothing about the person", async ({ page, browser, baseURL }) => {
    const hidden = await apiUser(browser, baseURL!, "hidden");
    await hidden.request.patch("/api/profiles/me", { data: { bio: "A secret bio", isPrivate: true } });
    const html = await (await page.request.get(`/p/${hidden.user.username}`)).text();
    expect(html).not.toContain("A secret bio");
    expect(html).not.toContain(hidden.user.displayName);
    expect(html).toContain("noindex");
    await hidden.context.close();
  });
});
