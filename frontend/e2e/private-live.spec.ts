import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// The three browser projects share one database, so each test uses a title of its own.
const uniq = (title: string) => `${title} ${Math.random().toString(36).slice(2, 7)}`;

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

type Person = Awaited<ReturnType<typeof apiUser>>;
const titlesFor = async (who: Person) => ((await (await who.request.get("/api/live")).json()).lives as { title: string }[]).map((l) => l.title);

test.describe("invite-only live rooms", () => {
  test("only the host and the friends invited can see it or get in; more can be invited, or taken back, while it is on", async ({ browser, baseURL }) => {
    const host = await apiUser(browser, baseURL!, "host");
    const ann = await apiUser(browser, baseURL!, "ann");
    const cat = await apiUser(browser, baseURL!, "cat");
    const stranger = await apiUser(browser, baseURL!, "stranger");
    await befriend(host.request, ann.request, host.user.username);
    await befriend(host.request, cat.request, host.user.username);

    const title = uniq("Just us");
    const started = await host.request.post("/api/live", { data: { title, private: true, invite: [ann.id] } });
    expect(started.status()).toBe(201);
    const id = (await started.json()).live.id as string;
    // a real host keeps sending heartbeats; slow browsers need that here too
    const beat = setInterval(() => void host.request.post(`/api/live/${id}/heartbeat`).catch(() => clearInterval(beat)), 5000);

    // ann is invited: it is in her list, marked private, and she can open the room, which says so
    const annPage = await ann.context.newPage();
    await annPage.goto("/live");
    const card = annPage.getByRole("link", { name: new RegExp(title) });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Private");
    await expectNoHorizontalOverflow(annPage);
    await expectReadable(annPage, "the live list with a private live");
    await card.click();
    await expect(annPage.getByRole("heading", { name: title })).toBeVisible();
    await expect(annPage.getByText(/only the people invited can see it/)).toBeVisible();
    await expect(annPage.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    await expectReadable(annPage, "a private live as an invited listener");
    // she was told
    await annPage.goto("/");
    await annPage.getByRole("button", { name: "Notifications" }).click();
    await expect(annPage.getByText(`invited you to a private live: "${title}"`)).toBeVisible();

    // nobody else can see it, or get in, or even tell it exists
    expect(await titlesFor(cat)).not.toContain(title);
    expect(await titlesFor(stranger)).not.toContain(title);
    for (const other of [cat, stranger]) {
      expect((await other.request.get(`/api/live/${id}`)).status()).toBe(404);
      expect((await other.request.post(`/api/live/${id}/join`)).status()).toBe(404);
    }
    const catPage = await cat.context.newPage();
    await catPage.goto(`/live/${id}`);
    await expect(catPage.getByText("This live isn't available.")).toBeVisible();
    // the host's friend who wasn't invited is not told either
    const catNotes = (await (await cat.request.get("/api/notifications")).json()).notifications as { type: string }[];
    expect(catNotes.filter((n) => n.type === "live_started" || n.type === "live_invite")).toHaveLength(0);

    // the host invites cat while it is on, and now she can see it and join
    expect((await host.request.post(`/api/live/${id}/invites`, { data: { userIds: [cat.id] } })).status()).toBe(201);
    await expect.poll(() => titlesFor(cat)).toContain(title);
    expect((await cat.request.post(`/api/live/${id}/join`)).status()).toBe(200);

    // and takes ann's invitation back: it disappears for her
    expect((await host.request.delete(`/api/live/${id}/invites/${ann.id}`)).status()).toBe(204);
    await expect.poll(() => titlesFor(ann)).not.toContain(title);
    expect((await ann.request.get(`/api/live/${id}`)).status()).toBe(404);

    // only friends can be invited
    const refused = await host.request.post(`/api/live/${id}/invites`, { data: { userIds: [stranger.id] } });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toBe("You can only invite your friends");

    // when it ends, the invitations go
    expect((await host.request.post(`/api/live/${id}/end`)).status()).toBe(204);
    clearInterval(beat);
    await expect
      .poll(async () => ((await (await cat.request.get("/api/notifications")).json()).notifications as { type: string }[]).filter((n) => n.type === "live_invite").length)
      .toBe(0);
    for (const who of [host, ann, cat, stranger]) await who.context.close();
  });

  test("a host starts one from the Go live form, picks friends, and manages the invitations from the room", async ({ page, browser, baseURL, browserName }) => {
    test.skip(browserName !== "chromium", "needs a fake microphone, which only Chrome can provide");
    const me = newUser("privhost");
    await signUpViaUi(page, me);
    const ann = await apiUser(browser, baseURL!, "ann");
    const cat = await apiUser(browser, baseURL!, "cat");
    await befriend(page.request, ann.request, me.username);
    await befriend(page.request, cat.request, me.username);

    await page.goto("/live");
    const title = uniq("Quiet room");
    await page.getByLabel("Live title").fill(title);
    await page.getByRole("checkbox", { name: "Invite only" }).check();
    await expect(page.getByText(/Only the friends you pick can see this live/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Go live form with friends to pick");
    await page.getByRole("checkbox", { name: new RegExp(ann.user.displayName) }).check();
    await expect(page.getByText("1 friend invited")).toBeVisible();
    await page.getByRole("button", { name: "Go live", exact: true }).click();

    // in the room: it says it is private, offers no share, and lists who is invited
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(/only the people invited can see it/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    const panel = page.getByRole("region", { name: "Invited people" });
    await expect(panel.getByText(ann.user.displayName)).toBeVisible();
    await expectReadable(page, "the host's room with the invitations");

    await expect.poll(() => titlesFor(ann)).toContain(title);
    expect(await titlesFor(cat)).not.toContain(title);

    // invite cat from the panel, then take ann back
    await panel.getByRole("button", { name: `Invite ${cat.user.displayName}` }).click();
    await expect.poll(() => titlesFor(cat)).toContain(title);
    await panel.getByRole("button", { name: `Take back the invitation to ${ann.user.displayName}` }).click();
    await expect.poll(() => titlesFor(ann)).not.toContain(title);

    // ending the live asks first
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "End live" }).click();
    await expect(page).toHaveURL(/\/live$/);
    await ann.context.close();
    await cat.context.close();
  });

  test("the form and the list read right to left and fit the screen in Arabic", async ({ page, browser, baseURL }) => {
    const me = newUser("arabicpriv");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "friend");
    await befriend(page.request, friend.request, me.username);
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto("/live");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("checkbox", { name: "بالدعوة فقط" }).check();
    await expect(page.getByText("الأصدقاء المدعوون")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Go live form in Arabic");
    await friend.context.close();
  });
});
