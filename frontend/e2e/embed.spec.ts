import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// a one-pixel picture, so nothing has to be fetched
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("embedding", () => {
  test("an owner allows embedding, copies the code, and another website can show the piece in a frame", async ({ page }) => {
    const me = newUser("embedder");
    await signUpViaUi(page, me);
    const caption = unique("A glazed vase");
    const made = await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } });
    expect(made.status()).toBe(201);
    const id = (await made.json()).mediaItem.id as string;

    // nothing is shown anywhere until the owner says so
    expect((await page.request.get(`/embed/piece/${id}`)).status()).toBe(404);

    await page.goto(`/u/${me.username}`);
    const tile = page.locator("[id^='piece-']").filter({ hasText: caption });
    await tile.getByRole("button", { name: "Embed this piece on another website" }).click();
    await expect(tile.getByLabel("Copy this into the page")).toHaveCount(0);
    const allow = tile.getByRole("checkbox", { name: "Let my pieces and profile card be shown on other websites" });
    await allow.click(); // saved straight away
    await expect(allow).toBeChecked();
    const code = tile.getByLabel("Copy this into the page");
    await expect(code).toBeVisible();
    await expect(code).toHaveValue(new RegExp(`<iframe src="http[^"]+/embed/piece/${id}"`));
    await expectNoHorizontalOverflow(page);

    // the preview is the card itself: the picture, its words, its maker and a link back
    const preview = tile.frameLocator("iframe[title='Preview of the embedded card']");
    await expect(preview.getByText(caption).first()).toBeVisible();
    await expect(preview.getByText(`by ${me.displayName}`)).toBeVisible();
    await expect(preview.getByRole("link", { name: "View on CreativesSelect" })).toHaveAttribute("href", new RegExp(`/u/${me.username}\\?piece=${id}#portfolio$`));

    // what the server says about it: framing from anywhere is allowed here and only here
    const res = await page.request.get(`/embed/piece/${id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["x-frame-options"]).toBeUndefined();
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors *");
    expect((await page.request.get("/api/health")).headers()["x-frame-options"]).toBe("SAMEORIGIN");

    // a page on another site: the code is pasted in and the card shows
    const copied = await code.inputValue();
    // a page on a different origin (a real little server of its own: a public address isn't allowed to call this computer's localhost)
    const site = createServer((_req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html><body><h1>My own website</h1>${copied}</body></html>`));
    await new Promise<void>((done) => site.listen(0, "127.0.0.1", done));
    try {
      await page.goto(`http://127.0.0.1:${(site.address() as AddressInfo).port}/`);
      const frame = page.frameLocator("iframe");
      await expect(frame.getByText(caption).first()).toBeVisible();
      await expect(frame.getByRole("img", { name: caption })).toBeVisible();
    } finally {
      site.close();
    }
  });

  test("the card is readable, and turning embedding off, or going private, makes it the same bare page as a missing one", async ({ page, request }) => {
    const me = newUser("withdrawer");
    await signUpViaUi(page, me);
    const caption = unique("Withdrawn soon");
    const id = (await (await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } })).json()).mediaItem.id as string;
    expect((await page.request.patch("/api/profiles/me", { data: { allowEmbeds: true } })).status()).toBe(200);

    await page.goto(`/embed/piece/${id}`);
    await expect(page.getByText(caption).first()).toBeVisible();
    await expectReadable(page, "an embedded piece");

    const bare = await (await request.get("/embed/piece/6ac93c2f67d5dc8c7fdb7931")).text();
    expect((await request.get(`/embed/piece/${id}`)).status()).toBe(200);
    await page.request.patch("/api/profiles/me", { data: { allowEmbeds: false } });
    const off = await request.get(`/embed/piece/${id}`);
    expect(off.status()).toBe(404);
    expect(await off.text()).toBe(bare);
    await page.request.patch("/api/profiles/me", { data: { allowEmbeds: true, isPrivate: true } });
    expect(await (await request.get(`/embed/piece/${id}`)).text()).toBe(bare);
    expect(await (await request.get(`/embed/profile/${me.username}`)).text()).toBe(bare);
  });

  test("a profile card is copied from the profile's settings and shows the name, bio and pieces", async ({ page }) => {
    const me = newUser("cardholder");
    await signUpViaUi(page, me);
    const caption = unique("On the card");
    await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } });
    await page.request.patch("/api/profiles/me", { data: { bio: "I make pots & jugs" } });

    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const box = page.getByRole("checkbox", { name: "Let my pieces and profile card be shown on other websites" });
    await box.click(); // saved straight away
    await expect(box).toBeChecked();
    await expect(page.getByLabel("Copy this into the page")).toHaveValue(new RegExp(`/embed/profile/${me.username}"`));
    const card = page.frameLocator("iframe[title='Preview of the embedded card']");
    await expect(card.getByRole("heading", { name: me.displayName })).toBeVisible();
    await expect(card.getByText("I make pots & jugs")).toBeVisible();
    await expect(card.getByText(`@${me.username}`)).toBeVisible();
    await expect(card.getByRole("img", { name: caption })).toBeVisible();
  });

  test("in Arabic the card reads right to left, and the owner's panel fits the screen", async ({ page }) => {
    const me = newUser("arabicembed");
    await signUpViaUi(page, me);
    const caption = unique("مزهرية");
    const id = (await (await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } })).json()).mediaItem.id as string;
    await page.request.patch("/api/profiles/me", { data: { allowEmbeds: true, language: "ar" } });

    await page.goto(`/embed/piece/${id}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("link", { name: "عرض على CreativesSelect" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "an embedded piece in Arabic");

    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/u/${me.username}`);
    const tile = page.locator("[id^='piece-']").filter({ hasText: caption });
    await tile.getByRole("button", { name: "تضمين هذا العمل في موقع آخر" }).click();
    await expect(tile.getByLabel("انسخ هذا إلى الصفحة")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
