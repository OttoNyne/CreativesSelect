import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;
// a topic nobody else's test uses
const topic = () => `tp${randomBytes(3).toString("hex").replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)])}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("following topics and the weekly summary", () => {
  test("a topic is followed from its page, appears in your topics, and what is posted about it shows under From your topics", async ({ page, browser, baseURL }) => {
    const poster = await secondBrowserUser(browser, baseURL!, "poster");
    const tag = topic();
    const words = unique(`A post about #${tag}`);
    const other = unique("A post about something else #elsewhere");
    expect((await poster.page.request.post("/api/posts", { data: { content: words } })).status()).toBe(201);
    expect((await poster.page.request.post("/api/posts", { data: { content: other } })).status()).toBe(201);

    await signUpViaUi(page, newUser("topical"));
    await page.goto("/explore");
    await expect(page.getByText("You aren't following any topics yet. Open a topic and follow it.")).toBeVisible();
    await page.goto(`/explore?tag=${tag}`);
    await expect(page.getByText(words)).toBeVisible();
    await page.getByRole("button", { name: `Follow the topic ${tag}` }).click();
    await expect(page.getByRole("button", { name: `Stop following the topic ${tag}` })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/explore");
    await expect(page.getByRole("region", { name: "Your topics" }).getByRole("link", { name: `#${tag}` })).toBeVisible();
    await page.getByRole("button", { name: "From your topics" }).click();
    await expect(page).toHaveURL(/mine=1/);
    await expect(page.getByText(words)).toBeVisible();
    await expect(page.getByText(other)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "From your topics");

    // stopping brings the empty message
    await page.goto(`/explore?tag=${tag}`);
    await page.getByRole("button", { name: `Stop following the topic ${tag}` }).click();
    await page.goto("/explore?mine=1");
    await expect(page.getByText("Nothing new in your topics yet.")).toBeVisible();
    await poster.context.close();
  });

  test("the weekly summary is switched on and off from the profile settings", async ({ page }) => {
    const me = newUser("digester");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const box = page.getByRole("checkbox", { name: "Email me a short summary once a week" });
    await expect(box).not.toBeChecked();
    await box.click();
    await expect(box).toBeChecked();
    await expect(page.getByText(/Confirm your email address first/)).toBeVisible(); // the new account's address isn't confirmed yet
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the weekly summary setting");
    await page.reload();
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByRole("checkbox", { name: "Email me a short summary once a week" })).toBeChecked();
    await page.getByRole("checkbox", { name: "Email me a short summary once a week" }).click();
    await expect(page.getByRole("checkbox", { name: "Email me a short summary once a week" })).not.toBeChecked();
  });

  test("the link in the email needs no sign-in, and says so when it isn't good any more", async ({ page }) => {
    await page.goto("/digest/unsubscribe#token=not-a-real-token");
    await expect(page.getByRole("alert")).toContainText("That link isn't valid any more");
    await expect(page).not.toHaveURL(/token=/); // the token is taken out of the address bar
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the unsubscribe page");
  });

  test("in Arabic the topics and the summary setting read right to left and fit the screen", async ({ page }) => {
    const me = newUser("arabictopics");
    await signUpViaUi(page, me);
    await page.request.put(`/api/topics/${topic()}`);
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/explore");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "مواضيعك" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "your topics in Arabic");
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "تعديل الملف الشخصي" }).click();
    await expect(page.getByRole("checkbox", { name: "أرسل لي ملخصًا قصيرًا بالبريد مرة في الأسبوع" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.goto("/digest/unsubscribe#token=x");
    await expect(page.getByRole("alert")).toContainText("هذا الرابط لم يعد صالحًا");
  });
});
