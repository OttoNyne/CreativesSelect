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

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("feedback on pieces", () => {
  test("a maker asks from the piece, a visitor gives two notes, the maker reads, thanks, and closes", async ({ page, browser, baseURL }) => {
    const me = newUser("maker");
    await signUpViaUi(page, me);
    const caption = unique("A glazed vase");
    expect((await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption } })).status()).toBe(201);

    // ask from the piece, with a question
    await page.goto(`/u/${me.username}`);
    const tile = page.locator("[id^='piece-']").filter({ hasText: caption });
    await tile.getByRole("button", { name: "Ask for feedback on this piece" }).click();
    const question = unique("Is the glaze too loud");
    await tile.getByLabel("A question for them (optional)").fill(question);
    await tile.getByRole("button", { name: "Ask", exact: true }).click();
    const link = tile.getByRole("link", { name: "Feedback requested (0)" });
    await expect(link).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // a visitor finds it on the board and gives feedback
    const visitor = await secondBrowserUser(browser, baseURL!, "critic");
    await visitor.page.goto("/critiques");
    await visitor.page.getByRole("link", { name: question }).click();
    await expect(visitor.page.getByRole("heading", { name: question })).toBeVisible();
    await expect(visitor.page.getByText("Only the maker and you can read this.")).toBeVisible();
    await visitor.page.getByLabel("What is working").fill("The colours sit well together.");
    await visitor.page.getByLabel("What I would change").fill("The rim looks uneven.");
    await expectNoHorizontalOverflow(visitor.page);
    await expectReadable(visitor.page, "the feedback form");
    await visitor.page.getByRole("button", { name: "Send feedback" }).click();
    await expect(visitor.page.getByRole("region", { name: "Your feedback" })).toContainText("The rim looks uneven.");

    // a third person can see that someone answered, but not what was said
    const bystander = await secondBrowserUser(browser, baseURL!, "bystander");
    await bystander.page.goto("/critiques");
    await expect(bystander.page.locator("article").filter({ hasText: question }).getByText("1 person gave feedback")).toBeVisible();
    await bystander.page.getByRole("link", { name: question }).click();
    await expect(bystander.page.getByText("The rim looks uneven.")).toHaveCount(0);
    await bystander.context.close();

    // the maker is told, reads it with who wrote it, and says thanks
    await page.goto("/");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText(`gave you feedback on your piece: ${caption}`)).toBeVisible();
    await page.getByRole("link", { name: "View feedback" }).first().click();
    await expect(page).toHaveURL(/\/critiques\/[0-9a-f]{24}$/);
    const notes = page.getByRole("region", { name: "Feedback you received" });
    await expect(notes.getByText("The colours sit well together.")).toBeVisible();
    await expect(notes.getByText(visitor.user.displayName)).toBeVisible();
    await expectReadable(page, "the feedback the maker received");
    await notes.getByRole("button", { name: `Say thanks to ${visitor.user.displayName}` }).click();
    await expect(notes.getByText("Thanked")).toBeVisible();

    // the writer is told, and sees it was thanked
    await visitor.page.getByRole("button", { name: "Notifications" }).click();
    await expect(visitor.page.getByText("thanked you for your feedback")).toBeVisible();
    await visitor.page.reload();
    await expect(visitor.page.getByText("The maker said thanks.")).toBeVisible();

    // closing takes it off the board and ends the form for others
    await page.getByRole("button", { name: "Close request" }).click();
    await expect(page.getByRole("button", { name: "Reopen request" })).toBeVisible();
    await visitor.page.goto("/critiques");
    await expect(visitor.page.getByRole("link", { name: question })).toHaveCount(0);
    await visitor.context.close();
  });

  test("the writer can change or take back their feedback, and the maker can remove one", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("owner"));
    const media = await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: unique("A bowl") } });
    const made = await page.request.post("/api/critiques", { data: { piece: (await media.json()).mediaItem.id } });
    expect(made.status()).toBe(201);
    const id = (await made.json()).critique.id;

    const writer = await secondBrowserUser(browser, baseURL!, "writer");
    await writer.page.goto(`/critiques/${id}`);
    await writer.page.getByLabel("What is working").fill("Nice shape.");
    await writer.page.getByRole("button", { name: "Send feedback" }).click();
    await writer.page.getByRole("button", { name: "Edit my feedback" }).click();
    await writer.page.getByLabel("What is working").fill("Lovely shape.");
    await writer.page.getByRole("button", { name: "Save" }).click();
    await expect(writer.page.getByText("Lovely shape.")).toBeVisible();

    // the maker removes it after asking
    await page.goto(`/critiques/${id}`);
    await expect(page.getByText("Lovely shape.")).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: `Remove feedback from ${writer.user.displayName}` }).click();
    await expect(page.getByText("Nobody has given feedback yet.")).toBeVisible();

    // so the writer may give it again, and then take it back
    await writer.page.reload();
    await writer.page.getByLabel("What I would change").fill("A touch taller.");
    await writer.page.getByRole("button", { name: "Send feedback" }).click();
    await writer.page.getByRole("button", { name: "Take my feedback back" }).click();
    await expect(writer.page.getByRole("button", { name: "Send feedback" })).toBeVisible();
    await writer.context.close();
  });

  test("a request from someone you have blocked is not there", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("blocker"));
    const other = await secondBrowserUser(browser, baseURL!, "asker");
    const media = await other.page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: unique("Hidden") } });
    const made = await other.page.request.post("/api/critiques", { data: { piece: (await media.json()).mediaItem.id, question: "Private matter?" } });
    const id = (await made.json()).critique.id;
    await page.goto(`/critiques/${id}`);
    await expect(page.getByRole("heading", { name: "Private matter?" })).toBeVisible();
    await other.page.request.patch("/api/profiles/me", { data: { isPrivate: true } });
    await page.reload();
    await expect(page.getByText("This request isn't available.")).toBeVisible();
    await other.context.close();
  });

  test("in Arabic the board and a request read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("arabiccritic"));
    const other = await secondBrowserUser(browser, baseURL!, "arabicmaker");
    const media = await other.page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: unique("مزهرية") } });
    const mid = (await media.json()).mediaItem.id;
    const made = await other.page.request.post("/api/critiques", { data: { piece: mid, question: unique("هل الألوان صاخبة؟") } });
    const id = (await made.json()).critique.id;
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/critiques");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الملاحظات", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /هل الألوان صاخبة/ }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the feedback board in Arabic");
    await page.goto(`/critiques/${id}`);
    await expect(page.getByRole("button", { name: "إرسال الملاحظات" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a feedback request in Arabic");
    await other.context.close();
  });
});
