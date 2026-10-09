import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

/** A call by the signed-in page's person, answered by a second person who is then chosen: returns the room's id. */
async function roomOf(page: Page, other: Awaited<ReturnType<typeof secondBrowserUser>>) {
  const title = unique("Project call");
  const call = (await (await page.request.post("/api/calls", { data: { title, details: "Let us make something." } })).json()).call;
  expect((await other.page.request.post(`/api/calls/${call.id}/apply`, { data: { note: "I am in" } })).status()).toBe(201);
  const apps = (await (await page.request.get(`/api/calls/${call.id}/applications`)).json()).applications;
  const answered = await page.request.post(`/api/calls/${call.id}/applications/${apps[0].id}/answer`, { data: { choose: true, reply: "Welcome" } });
  expect(answered.status()).toBe(200);
  return { title, callId: call.id as string, id: (await answered.json()).application.projectId as string };
}

test.describe("project rooms", () => {
  test("choosing someone opens a room, which both people find from the call, and where they chat and share a checklist", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("lead"));
    const other = await secondBrowserUser(browser, baseURL!, "helper");
    const title = unique("Our EP");
    const call = (await (await page.request.post("/api/calls", { data: { title, details: "Three songs." } })).json()).call;

    // they answer on the page; the owner chooses them there
    await other.page.goto(`/calls/${call.id}`);
    await other.page.getByLabel("A few words about why you fit").fill("I can sing alto.");
    await other.page.getByRole("button", { name: "Send answer" }).click();
    await expect(other.page.getByRole("heading", { name: /Your answer: Waiting/ })).toBeVisible();
    await page.goto(`/calls/${call.id}`);
    await expect(page.getByRole("link", { name: "Open project room" })).toHaveCount(0);
    await page.getByRole("button", { name: /^Choose / }).click();
    await expect(page.getByRole("link", { name: "Open project room" })).toBeVisible();

    // the one chosen is told and finds the room from the call
    await other.page.reload();
    await expect(other.page.getByRole("link", { name: "Open project room" })).toBeVisible();
    await other.page.getByRole("link", { name: "Open project room" }).click();
    await expect(other.page).toHaveURL(/\/projects\/[0-9a-f]{24}$/);
    await expect(other.page.getByRole("heading", { name: call.title })).toBeVisible();

    // chat: what one writes reaches the other
    await page.getByRole("link", { name: "Open project room" }).click();
    const first = unique("Welcome to the room");
    await page.getByRole("textbox", { name: "Write a message" }).fill(first);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(first)).toBeVisible();
    await expect(other.page.getByText(first)).toBeVisible({ timeout: 20_000 });
    const reply = unique("Glad to be here");
    await other.page.getByRole("textbox", { name: "Write a message" }).fill(reply);
    await other.page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(reply)).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a project room");

    // checklist: one adds, the other ticks it off
    const thing = unique("Send the stems");
    await page.getByRole("textbox", { name: "Something that needs doing" }).fill(thing);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: `Mark done: ${thing}` })).toBeVisible();
    await other.page.reload();
    await other.page.getByRole("checkbox", { name: `Mark done: ${thing}` }).click();
    await expect(other.page.getByRole("checkbox", { name: `Mark not done: ${thing}` })).toBeChecked();

    // the list of rooms shows it
    await other.page.goto("/projects");
    await expect(other.page.getByRole("link", { name: title })).toBeVisible();
    await other.context.close();
  });

  test("the owner archives the room, which can still be read but not written in, and the other person can leave", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("keeper"));
    const other = await secondBrowserUser(browser, baseURL!, "leaver");
    const room = await roomOf(page, other);
    expect((await page.request.post(`/api/projects/${room.id}/messages`, { data: { content: "Before archiving" } })).status()).toBe(201);

    await page.goto(`/projects/${room.id}`);
    await page.getByRole("button", { name: "Archive project" }).click();
    await expect(page.getByText(/This project is archived: it can be read/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Write a message" })).toHaveCount(0);
    await expect(page.getByText("Before archiving")).toBeVisible();

    await other.page.goto(`/projects/${room.id}`);
    await expect(other.page.getByText(/This project is archived/)).toBeVisible();
    await expect(other.page.getByRole("button", { name: "Archive project" })).toHaveCount(0);
    other.page.once("dialog", (d) => d.accept());
    await other.page.getByRole("button", { name: "Leave project" }).click();
    await expect(other.page).toHaveURL(/\/projects$/);
    await expect(other.page.getByText(/You're not in any project rooms yet/)).toBeVisible();
    expect((await other.page.request.get(`/api/projects/${room.id}`)).status()).toBe(404);
    await other.context.close();
  });

  test("a stranger can't open a room, and the owner can remove someone from it", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("host"));
    const member = await secondBrowserUser(browser, baseURL!, "member");
    const stranger = await secondBrowserUser(browser, baseURL!, "stranger");
    const room = await roomOf(page, member);
    await stranger.page.goto(`/projects/${room.id}`);
    await expect(stranger.page.getByText("This project isn't available.")).toBeVisible();

    await page.goto(`/projects/${room.id}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: `Remove ${member.user.displayName} from the project` }).click();
    await expect(page.getByRole("button", { name: `Remove ${member.user.displayName} from the project` })).toHaveCount(0);
    expect((await member.page.request.get(`/api/projects/${room.id}`)).status()).toBe(404);
    await member.context.close();
    await stranger.context.close();
  });

  test("in Arabic the room reads right to left and fits the screen", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("arabiclead"));
    const other = await secondBrowserUser(browser, baseURL!, "arabichelper");
    const room = await roomOf(page, other);
    await page.request.post(`/api/projects/${room.id}/messages`, { data: { content: "مرحبًا بالجميع" } });
    await page.request.post(`/api/projects/${room.id}/tasks`, { data: { text: "إرسال المقاطع" } });
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/projects/${room.id}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("مرحبًا بالجميع")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "تحديد كمنجز: إرسال المقاطع" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "a project room in Arabic");
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "غرف المشاريع" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await other.context.close();
  });
});
