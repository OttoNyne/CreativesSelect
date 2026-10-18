import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// a one-pixel picture, so nothing has to be fetched from anywhere
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// found by its test id, not its name, so the same test finds it in Arabic too
const canvas = (page: Page) => page.getByTestId("sketch-canvas");

/** How many pixels of the drawing are not the colour of blank paper. */
const inkOn = (page: Page) =>
  canvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] !== 255 || data[i + 1] !== 253 || data[i + 2] !== 248) ink++;
    return ink;
  });

/** Draws through these places on the page (as fractions of its width and height) with the mouse. The page is measured each time, because pressing a tool can scroll it. */
async function drawThrough(page: Page, places: [number, number][]) {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(places[0]));
  await page.mouse.down();
  for (const place of places.slice(1)) await page.mouse.move(...at(place), { steps: 10 });
  await page.mouse.up();
}

/** A line across the page, bending at the bottom. */
const scribble = (page: Page) => drawThrough(page, [[0.2, 0.2], [0.5, 0.6], [0.8, 0.3]]);

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("the sketchpad and the spark dice", () => {
  test("anyone can draw, undo and download, and is invited to sign up to post", async ({ page }) => {
    await page.goto("/sketch");
    await expect(page.getByRole("heading", { name: "Sketchpad" })).toBeVisible();
    await expect(page).toHaveTitle(/Sketchpad/);
    expect(await inkOn(page)).toBe(0);
    await expect(page.getByRole("button", { name: "Download picture" })).toBeDisabled();

    await scribble(page);
    expect(await inkOn(page)).toBeGreaterThan(500);
    await expect(page.getByRole("button", { name: "Download picture" })).toBeEnabled();
    await expect(page.getByRole("region", { name: "Post it to your portfolio" }).getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the sketchpad");

    // the picture really downloads, as a PNG
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download picture" }).click();
    expect((await download).suggestedFilename()).toBe("sketch.png");

    await page.getByRole("button", { name: "Undo" }).click();
    expect(await inkOn(page)).toBe(0);
    await page.getByRole("button", { name: "Redo" }).click();
    expect(await inkOn(page)).toBeGreaterThan(500);
    const before = await inkOn(page);
    await page.getByRole("button", { name: "Eraser" }).click();
    await drawThrough(page, [[0.2, 0.2], [0.35, 0.4]]);
    // the eraser takes ink away
    expect(await inkOn(page)).toBeLessThan(before);
  });

  test("an unfinished drawing is still there after the page is reloaded", async ({ page }) => {
    await page.goto("/sketch");
    await scribble(page);
    const ink = await inkOn(page);
    await page.reload();
    // the kept drawing keeps whole pixels only, so it can differ from the live one by a hair
    await expect.poll(async () => Math.abs((await inkOn(page)) - ink) / ink).toBeLessThan(0.03);
    await page.getByRole("button", { name: "Clear" }).click();
    await page.getByRole("button", { name: "Clear everything?" }).click();
    expect(await inkOn(page)).toBe(0);
    await page.reload();
    expect(await inkOn(page)).toBe(0);
  });

  test("the dice give today's spark, roll three of your own, and 'Sketch this' carries the spark to the page", async ({ page }) => {
    await page.goto("/sketch");
    const dice = page.getByRole("region", { name: "Need a spark?" });
    await expect(dice.getByText("Spark of the day")).toBeVisible();
    await dice.getByRole("button", { name: "Roll the dice" }).click();
    await expect(dice.getByRole("button", { name: /^Roll again:/ })).toHaveCount(3);
    await dice.getByRole("button", { name: /^Roll again: Twist/ }).click();
    await expectReadable(page, "the dice");

    await dice.getByRole("button", { name: "Sketch this" }).click();
    await expect(page.getByText(/^Drawing: /)).toBeVisible();
    await expect(page).toHaveURL(/spark=\d+-\d+-\d+/);
    await page.getByRole("button", { name: "Draw anything" }).click();
    await expect(page).not.toHaveURL(/spark=/);
  });

  test("a link to a spark opens the sketchpad on it, and the caption starts from it", async ({ page }) => {
    await signUpViaUi(page, newUser("sparklink"));
    await page.goto("/sketch?spark=1-1-1");
    await expect(page.getByText("Drawing: A lighthouse, upside down. Only three colors.")).toBeVisible();
    await expect(page.getByLabel("Caption")).toHaveValue("A lighthouse, upside down. Only three colors. #sketchpad");
  });

  test("the explore page and the challenge page lead to it", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("link", { name: "Sketchpad and spark dice" }).click();
    await expect(page.getByRole("heading", { name: "Sketchpad" })).toBeVisible();
    await page.goto("/challenge");
    await page.getByRole("link", { name: "Need a spark? Roll the dice" }).click();
    await expect(page.getByRole("heading", { name: "Sketchpad" })).toBeVisible();
  });

  test("a signed-in person posts the drawing: a PNG and the caption go to the portfolio, and the next steps appear", async ({ page }) => {
    const me = newUser("sketcher");
    await signUpViaUi(page, me);
    let sent: { body: Buffer; url: string } | null = null;
    // the picture store is not part of this test, so its answer is made up; what is sent to it is checked
    await page.route("**/api/media/upload*", async (route) => {
      sent = { body: route.request().postDataBuffer()!, url: route.request().url() };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ url: PIXEL, mediaItem: { id: "m1", url: PIXEL, type: "image", caption: "A fox #sketchpad" } }) });
    });
    await page.goto("/sketch");
    await expect(page.getByRole("button", { name: "Post to my portfolio" })).toBeDisabled();
    await scribble(page);
    await page.getByLabel("Caption").fill("A fox #sketchpad");
    await page.getByRole("button", { name: "Post to my portfolio" }).click();
    await expect(page.getByText("Posted! It is now in your portfolio.")).toBeVisible();
    await expect(page.getByRole("link", { name: "See it on my profile" })).toHaveAttribute("href", `/u/${me.username}`);
    await expect(page.getByRole("button", { name: "Enter it in this week's challenge" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the sketchpad after posting");

    const { body, url } = sent!;
    expect(url).toContain("purpose=portfolio");
    const text = body.toString("latin1");
    expect(text).toContain('name="caption"');
    expect(text).toContain("A fox #sketchpad");
    expect(text).toContain('filename="sketch.png"');
    // the file part starts with the PNG signature
    expect(body.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);

    await page.getByRole("button", { name: "Draw another" }).click();
    expect(await inkOn(page)).toBe(0);
  });

  test("in Arabic the page reads right to left and fits the screen", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/sketch?spark=2-3-4");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "لوح الرسم" })).toBeVisible();
    await scribble(page);
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the sketchpad in Arabic");
  });
});
