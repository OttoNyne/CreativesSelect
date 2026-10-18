import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { PNG } from "pngjs";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// The test database is shared by every test, so each chain is found by an idea of its own.
const idea = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

/** A real PNG of a given size, for the tests that send a part without drawing it. */
function png(width: number, height: number) {
  const picture = new PNG({ width, height });
  for (let i = 0; i < picture.data.length; i += 4) {
    picture.data[i] = 30;
    picture.data[i + 1] = 90;
    picture.data[i + 2] = 200;
    picture.data[i + 3] = 255;
  }
  return PNG.sync.write(picture);
}
const form = (extra: Record<string, unknown>) => ({ section: { name: "section.png", mimeType: "image/png", buffer: png(1200, 400) }, edge: { name: "edge.png", mimeType: "image/png", buffer: png(1200, 40) }, ...extra });

const canvas = (page: Page) => page.getByTestId("sketch-canvas");

/** Draws a line across the page with the mouse (measured each time, because pressing a tool can scroll the page). */
async function scribble(page: Page) {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  const at = (x: number, y: number) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(0.2, 0.3));
  await page.mouse.down();
  await page.mouse.move(...at(0.5, 0.7), { steps: 10 });
  await page.mouse.move(...at(0.8, 0.4), { steps: 10 });
  await page.mouse.up();
}

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

/** Every picture on the page has really loaded (not a broken image). */
const picturesLoaded = (page: Page, selector = "img") => page.locator(selector).evaluateAll((imgs) => (imgs as HTMLImageElement[]).map((i) => [i.complete, i.naturalWidth, i.naturalHeight]));

test.describe("drawing chains", () => {
  test("three people draw a chain, each seeing only the edge of the part before, and the whole drawing appears", async ({ page, browser, baseURL }) => {
    const words = idea("A very tall cat");

    // the first person starts it
    const starter = newUser("starter");
    await signUpViaUi(page, starter);
    await page.goto("/chains");
    await page.getByRole("link", { name: "Start a chain" }).click();
    await expect(page.getByRole("heading", { name: "Start a chain" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send the first part" })).toBeDisabled();
    await page.getByLabel("Idea (optional)").fill(words);
    await scribble(page);
    await page.getByRole("button", { name: "Send the first part" }).click();
    await expect(page.getByText("Sent! Your part is on its way to the next person.")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a chain just started");

    // the second person finds it, is shown only the edge, and draws the middle
    const second = await secondBrowserUser(browser, baseURL!, "middle");
    await second.page.goto("/chains");
    const card = second.page.getByText(words).locator("xpath=ancestor::li");
    await expect(card.getByText("Part 2 of 3")).toBeVisible();
    await expectReadable(second.page, "the board of waiting chains");
    await card.getByRole("link", { name: "Draw part 2" }).click();
    await expect(second.page.getByRole("heading", { name: "Draw part 2 of 3" })).toBeVisible();
    const strip = second.page.getByRole("img", { name: "The bottom edge of the part before" });
    await expect(strip).toBeVisible();
    // the strip really is a picture, 1200 across and 40 high, and nothing else of the first part is on the page
    await expect.poll(() => picturesLoaded(second.page, 'img[alt="The bottom edge of the part before"]')).toEqual([[true, 1200, 40]]);
    await expect(second.page.getByText(/You have (29|30) minutes to draw this part/)).toBeVisible();
    await expectNoHorizontalOverflow(second.page);
    await expectReadable(second.page, "drawing the middle part");
    await scribble(second.page);
    await second.page.getByRole("button", { name: "Send part 2" }).click();
    await expect(second.page.getByText("Your part is in. The chain is now waiting for part 3.")).toBeVisible();

    // the third draws the last part, and then everyone can see the whole
    const third = await secondBrowserUser(browser, baseURL!, "last");
    await third.page.goto("/chains");
    await third.page.getByText(words).locator("xpath=ancestor::li").getByRole("link", { name: "Draw part 3" }).click();
    await expect(third.page.getByText("This is the last part. Once you send it, the whole drawing is shown.")).toBeVisible();
    await scribble(third.page);
    await third.page.getByRole("button", { name: "Send part 3" }).click();

    await expect(third.page).toHaveURL(/\/chains\/[0-9a-f]{24}$/);
    await expect(third.page.getByRole("heading", { name: words })).toBeVisible();
    const parts = third.page.getByRole("img", { name: /^Part \d, drawn by/ });
    await expect(parts).toHaveCount(3);
    await expect.poll(() => picturesLoaded(third.page, 'img[alt^="Part "]')).toEqual([[true, 1200, 400], [true, 1200, 400], [true, 1200, 400]]);
    await expect(third.page.getByRole("link", { name: starter.displayName })).toBeVisible();
    await expect(third.page.getByRole("link", { name: second.user.displayName })).toBeVisible();
    await expect(third.page.getByRole("button", { name: "Save to my portfolio" })).toBeVisible();
    await expect(third.page.getByRole("button", { name: "Report part 2" })).toBeVisible();
    await expectNoHorizontalOverflow(third.page);
    await expectReadable(third.page, "a finished chain");

    // the people who drew earlier are told, and it is in the finished list for the first person
    const notices = await (await page.request.get("/api/notifications")).json();
    expect(JSON.stringify(notices)).toContain("chain_done");
    await page.goto("/chains");
    await page.getByRole("button", { name: "Finished" }).click();
    await expect(page.getByRole("link", { name: words })).toBeVisible();
    await page.getByRole("button", { name: "My chains" }).click();
    await expect(page.getByText(words).locator("xpath=ancestor::li").getByText("Finished")).toBeVisible();

    await second.context.close();
    await third.context.close();
  });

  test("nobody sees a part of an unfinished chain, only the strip and only after taking the part; one person at a time", async ({ browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "maker");
    const words = idea("Hidden");
    const started = await maker.request.post("/api/chains", { multipart: form({ prompt: words }) });
    expect(started.status()).toBe(201);
    const { chain } = await started.json();

    const first = await apiUser(browser, baseURL!, "first");
    const second = await apiUser(browser, baseURL!, "second");
    // nothing of the part is given out, to anyone but the person who drew it
    expect((await first.request.get(`/api/chains/${chain.id}/sections/0/image`)).status()).toBe(404);
    expect((await first.request.get(`/api/chains/${chain.id}/edge`)).status()).toBe(404);
    expect((await maker.request.get(`/api/chains/${chain.id}/sections/0/image`)).status()).toBe(200);

    // taking the part gives the strip, and keeps it from anyone else
    expect((await first.request.post(`/api/chains/${chain.id}/claim`)).status()).toBe(200);
    const edge = await first.request.get(`/api/chains/${chain.id}/edge`);
    expect(edge.status()).toBe(200);
    expect(edge.headers()["content-type"]).toBe("image/png");
    expect((await second.request.post(`/api/chains/${chain.id}/claim`)).status()).toBe(409);
    expect((await second.request.get(`/api/chains/${chain.id}/edge`)).status()).toBe(404);

    // giving the part back lets someone else have it, and a picture of the wrong size is turned away
    expect((await first.request.delete(`/api/chains/${chain.id}/claim`)).status()).toBe(204);
    expect((await second.request.post(`/api/chains/${chain.id}/claim`)).status()).toBe(200);
    const wrong = await second.request.post(`/api/chains/${chain.id}/sections`, { multipart: { section: { name: "s.png", mimeType: "image/png", buffer: png(100, 100) }, edge: { name: "e.png", mimeType: "image/png", buffer: png(1200, 40) } } });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toBe("That drawing isn't the right size");

    for (const who of [maker, first, second]) await who.context.close();
  });

  test("a private profile is asked to go public before it can take part", async ({ page }) => {
    await signUpViaUi(page, newUser("shy"));
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    await page.goto("/chains/new");
    await scribble(page);
    await page.getByRole("button", { name: "Send the first part" }).click();
    await expect(page.getByRole("alert")).toContainText("only public profiles can take part");
  });

  test("the chain pages are for people who are signed in", async ({ page }) => {
    await page.goto("/chains");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("it is easy to find: in the menu or the top bar", async ({ page }) => {
    await signUpViaUi(page, newUser("seeker"));
    const menu = page.getByRole("button", { name: "Menu" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Chains", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Drawing chains" })).toBeVisible();
    await expect(page).toHaveTitle(/Drawing chains/);
  });

  test("in Arabic the pages read right to left and fit the screen", async ({ page }) => {
    await signUpViaUi(page, newUser("arabicchain"));
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/chains");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "سلاسل الرسم" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the chains in Arabic");
    await page.goto("/chains/new");
    await expect(page.getByRole("heading", { name: "ابدأ سلسلة" })).toBeVisible();
    await scribble(page);
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "starting a chain in Arabic");
  });
});
