import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// a one-pixel picture, so nothing has to be fetched
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;
// a role nobody else's test uses, so only this test's people match it
const role = () => `rl${randomBytes(3).toString("hex").replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)])}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("open calls", () => {
  test("a call is posted, the person it fits is told, answers with a piece, is chosen with a note, and the call is closed", async ({ page, browser, baseURL }) => {
    const wanted = role();
    const poster = newUser("poster");
    await signUpViaUi(page, poster);

    // someone who offers that, open to work, with a piece to show
    const fitter = await secondBrowserUser(browser, baseURL!, "fitter");
    expect((await fitter.page.request.patch("/api/profiles/me", { data: { workOffers: [wanted], openToWork: true } })).status()).toBe(200);
    const caption = unique("My demo reel");
    expect((await fitter.page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } })).status()).toBe(201);

    // post the call from the page
    const title = unique("Looking for a collaborator");
    await page.goto("/calls");
    await page.getByRole("button", { name: "Post a call" }).click();
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("What you are looking for").fill("A warm voice for three songs.");
    await page.getByRole("textbox", { name: /^Looking for/ }).fill(wanted);
    await page.getByRole("textbox", { name: /^Looking for/ }).press("Enter");
    await page.getByLabel("Budget or terms (optional)").fill("unpaid, credit");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Post call" }).click();
    await expect(page.getByRole("status")).toContainText("1 person who fits was told");
    const mine = page.locator("article").filter({ hasText: title });
    await expect(mine).toBeVisible();

    // the person it fits is told, and finds it under For you
    await fitter.page.goto("/");
    await fitter.page.getByRole("button", { name: "Notifications" }).click();
    await expect(fitter.page.getByText(`posted an open call that fits what you offer: ${title}`)).toBeVisible();
    await fitter.page.getByRole("link", { name: "View call" }).first().click();
    await expect(fitter.page).toHaveURL(/\/calls\/[0-9a-f]{24}$/);
    await expect(fitter.page.getByRole("heading", { name: title })).toBeVisible();
    await expect(fitter.page.getByText(`Fits what you offer: ${wanted}`)).toBeVisible();
    await fitter.page.goto("/calls");
    await fitter.page.getByRole("button", { name: "For you" }).click();
    await expect(fitter.page.getByRole("link", { name: title })).toBeVisible();

    // they answer with words and a piece
    await fitter.page.getByRole("link", { name: title }).click();
    await fitter.page.getByLabel("A few words about why you fit").fill("I sing alto and have a reel.");
    await fitter.page.locator("label", { has: fitter.page.getByRole("radio", { name: caption }) }).click();
    await expect(fitter.page.getByRole("radio", { name: caption })).toBeChecked();
    await expectNoHorizontalOverflow(fitter.page);
    await fitter.page.getByRole("button", { name: "Send answer" }).click();
    await expect(fitter.page.getByRole("heading", { name: /Your answer: Waiting/ })).toBeVisible();
    await expectReadable(fitter.page, "an answered call");

    // the poster sees it, chooses them with a note
    await mine.getByRole("link", { name: title }).click();
    const answers = page.getByRole("region", { name: "Answers" });
    await expect(answers.getByText("I sing alto and have a reel.")).toBeVisible();
    await expect(answers.getByRole("img", { name: caption })).toBeVisible();
    await answers.getByRole("textbox", { name: new RegExp(`^A note for ${fitter.user.displayName}`) }).fill("Let's talk this week.");
    await expectReadable(page, "the answers to a call");
    await answers.getByRole("button", { name: `Choose ${fitter.user.displayName}` }).click();
    await expect(answers.getByText("Chosen")).toBeVisible();

    // the fitter is told and sees the note
    await fitter.page.reload();
    await expect(fitter.page.getByRole("heading", { name: /Your answer: Chosen/ })).toBeVisible();
    await expect(fitter.page.getByText("Let's talk this week.")).toBeVisible();
    await fitter.page.getByRole("button", { name: "Notifications" }).click();
    await expect(fitter.page.getByText(`chose you for the open call: ${title}`)).toBeVisible();

    // closing it takes it off the board
    await page.getByRole("button", { name: "Close call" }).click();
    await expect(page.getByRole("button", { name: "Reopen call" })).toBeVisible();
    await fitter.page.goto("/calls");
    await expect(fitter.page.getByRole("link", { name: title })).toHaveCount(0);
    await fitter.context.close();
  });

  test("the owner is shown people who might fit, and can see an answer taken back", async ({ page, browser, baseURL }) => {
    const wanted = role();
    await signUpViaUi(page, newUser("seeker"));
    const maybe = await secondBrowserUser(browser, baseURL!, "maybe");
    await maybe.page.request.patch("/api/profiles/me", { data: { tags: [wanted], openToWork: true } });
    const title = unique("A call with suggestions");
    const made = await page.request.post("/api/calls", { data: { title, details: "Anyone with this skill.", lookingFor: [wanted] } });
    expect(made.status()).toBe(201);
    const id = (await made.json()).call.id;
    await page.goto(`/calls/${id}`);
    const matches = page.getByRole("region", { name: "People who might fit" });
    await expect(matches.getByRole("link", { name: `View ${maybe.user.displayName}'s profile` })).toBeVisible();
    await expect(matches.getByText(`Matches: ${wanted}`)).toBeVisible();

    // they answer, then take it back
    await maybe.page.goto(`/calls/${id}`);
    await maybe.page.getByLabel("A few words about why you fit").fill("Here!");
    await maybe.page.getByRole("button", { name: "Send answer" }).click();
    await maybe.page.getByRole("button", { name: "Withdraw answer" }).click();
    await expect(maybe.page.getByRole("button", { name: "Send answer" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Nobody has answered yet.")).toBeVisible();
    await maybe.context.close();
  });

  test("a call from someone you have blocked, or a private profile, is not there", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("looker"));
    const other = await secondBrowserUser(browser, baseURL!, "caller");
    const made = await other.page.request.post("/api/calls", { data: { title: unique("A private matter"), details: "Details." } });
    const id = (await made.json()).call.id;
    await page.goto(`/calls/${id}`);
    await expect(page.getByRole("heading", { name: /A private matter/ })).toBeVisible();
    await other.page.request.patch("/api/profiles/me", { data: { isPrivate: true } });
    await page.reload();
    await expect(page.getByText("This call isn't available.")).toBeVisible();
    await other.context.close();
  });

  test("in Arabic the board, the form and a call read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    const wanted = role();
    await signUpViaUi(page, newUser("arabiccall"));
    const other = await secondBrowserUser(browser, baseURL!, "arabiccaller");
    const made = await other.page.request.post("/api/calls", { data: { title: unique("مطلوب مغنٍّ"), details: "نبحث عن صوت دافئ لثلاث أغنيات.", lookingFor: [wanted], budget: "بدون أجر", deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) } });
    const id = (await made.json()).call.id;
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/calls");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الدعوات المفتوحة" })).toBeVisible();
    await expect(page.getByRole("link", { name: /مطلوب مغنٍّ/ }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the open calls board in Arabic");
    await page.getByRole("button", { name: "نشر دعوة" }).click();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the call form in Arabic");
    await page.goto(`/calls/${id}`);
    await expect(page.getByRole("heading", { name: /مطلوب مغنٍّ/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "إرسال الإجابة" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a call in Arabic");
    await other.context.close();
  });
});
