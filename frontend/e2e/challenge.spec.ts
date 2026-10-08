import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// a one-pixel picture, so nothing has to be fetched from anywhere
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// The challenge is the same for everyone and the test database is shared by every test, so each test finds its own pieces by a caption of its own.
const caption = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("the weekly challenge", () => {
  test("someone who isn't signed in sees the prompt and is invited to join", async ({ page }) => {
    await page.goto("/challenge");
    await expect(page.getByRole("heading", { name: "Weekly challenge" })).toBeVisible();
    await expect(page.getByRole("region", { name: "This week's prompt" })).toBeVisible();
    await expect(page.getByText(/Sign up or log in to enter a piece/)).toBeVisible();
    await expect(page).toHaveTitle(/Weekly challenge/);
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the challenge, signed out");
  });

  test("a person enters a piece, it shows in the gallery for everyone, and they can take it back", async ({ page, browser, baseURL }) => {
    const maker = newUser("entrant");
    const title = caption("A quiet pond");
    await signUpViaUi(page, maker);
    const piece = await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: title } });
    expect(piece.status()).toBe(201);

    await page.goto("/challenge");
    await expect(page.getByRole("combobox", { name: "Choose a piece to enter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter the challenge" })).toBeDisabled();
    await page.getByRole("combobox", { name: "Choose a piece to enter" }).selectOption({ label: `Piece 1: ${title}` });
    await page.getByRole("button", { name: "Enter the challenge" }).click();
    await expect(page.getByRole("status")).toContainText("You're in!");
    const gallery = page.getByRole("region", { name: "Gallery" });
    await expect(gallery.getByRole("img", { name: title })).toBeVisible();
    await expect(gallery.getByRole("link", { name: new RegExp(maker.displayName) })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the challenge with an entry");

    // anyone can see it, signed in or not
    const visitor = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const stranger = await visitor.newPage();
    await stranger.goto("/challenge");
    await expect(stranger.getByRole("region", { name: "Gallery" }).getByRole("img", { name: title })).toBeVisible();
    await expect(stranger.getByText(/entr(y|ies) so far/)).toBeVisible();
    await visitor.close();

    // it is theirs to take back, and they can choose again
    await page.reload();
    await expect(page.getByRole("region", { name: "Your entry this week" })).toContainText(title);
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByRole("status")).toContainText("Your entry was withdrawn.");
    await expect(page.getByRole("combobox", { name: "Choose a piece to enter" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Gallery" }).getByRole("img", { name: title })).toHaveCount(0);
  });

  test("the gallery can be ordered by what people loved, and a second entry in a week is refused", async ({ page, browser, baseURL }) => {
    const loved = caption("Loved piece");
    const newer = caption("Newer piece");
    const first = await apiUser(browser, baseURL!, "firstpick");
    const second = await apiUser(browser, baseURL!, "secondpick");
    const one = (await (await first.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: loved } })).json()).mediaItem;
    const two = (await (await second.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: newer } })).json()).mediaItem;
    expect((await first.request.post("/api/challenges/current/entry", { data: { itemId: one.id } })).status()).toBe(201);
    expect((await second.request.post("/api/challenges/current/entry", { data: { itemId: two.id } })).status()).toBe(201);
    const again = await first.request.post("/api/challenges/current/entry", { data: { itemId: one.id } });
    expect(again.status()).toBe(409);
    expect((await again.json()).error).toBe("You've already entered this week's challenge");
    expect((await second.request.put(`/api/media/${one.id}/reaction`, { data: { emoji: "love" } })).status()).toBe(200);

    // where the two pieces stand in the gallery as drawn: true when the loved one comes before the newer one
    const lovedFirst = async () => {
      const texts = await page.getByRole("region", { name: "Gallery" }).getByRole("listitem").allTextContents();
      const a = texts.findIndex((x) => x.includes(loved));
      const b = texts.findIndex((x) => x.includes(newer));
      return a >= 0 && b >= 0 ? a < b : null;
    };
    await page.goto("/challenge");
    const gallery = page.getByRole("region", { name: "Gallery" });
    await expect.poll(lovedFirst).toBe(false); // newest first: the one that came second is first
    await gallery.getByRole("button", { name: "Most loved" }).click();
    await expect(gallery.getByRole("button", { name: "Most loved" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(lovedFirst).toBe(true); // the older one has the reaction
    await gallery.getByRole("button", { name: "Newest" }).click();
    await expect.poll(lovedFirst).toBe(false);
    await first.context.close();
    await second.context.close();
  });

  test("a private profile is told to make it public to take part", async ({ page }) => {
    await signUpViaUi(page, newUser("hushed"));
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    await page.goto("/challenge");
    await expect(page.getByText(/Your profile is private/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Choose a piece to enter" })).toHaveCount(0);
  });

  test("in Arabic the page reads right to left, fits the screen and is readable; in Spanish it is in Spanish", async ({ page, browser, baseURL }) => {
    const title = caption("صورة");
    const maker = await apiUser(browser, baseURL!, "arabicentry");
    const made = (await (await maker.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: title } })).json()).mediaItem;
    await maker.request.post("/api/challenges/current/entry", { data: { itemId: made.id } });

    await page.goto("/challenge");
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "التحدي الأسبوعي" })).toBeVisible();
    await expect(page.getByRole("region", { name: "موضوع هذا الأسبوع" })).toBeVisible();
    await expect(page.getByRole("region", { name: "المعرض" }).getByRole("img", { name: title })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Arabic challenge");

    await page.evaluate(() => localStorage.setItem("cs-language", "es"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Reto semanal" })).toBeVisible();
    await expect(page.getByText(/Abierto hasta/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await maker.context.close();
  });
});
