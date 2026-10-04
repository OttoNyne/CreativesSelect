import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const uniq = (title: string) => `${title} ${Math.random().toString(36).slice(2, 7)}`;
// a datetime-local value (the viewer's own clock) some minutes ahead
function localInput(minutesAhead: number) {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const plans = (page: Page) => page.getByRole("region", { name: "Upcoming lives" });
const bell = async (page: Page) => {
  await page.reload();
  await page.getByRole("button", { name: "Notifications" }).click();
};

test.describe("scheduling a live", () => {
  test("a host plans one, friends are told and can ask for a reminder, and the host can cancel", async ({ page, browser, baseURL }) => {
    const me = newUser("planner");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "fan");
    await befriend(page.request, friend.request, me.username);

    const title = uniq("Friday jam");
    await page.goto("/live");
    await page.getByLabel("Plan title").fill(title);
    await page.getByLabel("Start time").fill(localInput(180));
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    const mine = plans(page).getByRole("listitem").filter({ hasText: title });
    await expect(mine).toBeVisible();
    await expect(mine).toContainText("You");
    await expect(mine).toContainText(/in [23] hours/);
    await expect(mine.getByRole("button", { name: "Start now" })).toBeVisible();
    await expect(mine.getByRole("button", { name: /Remind me/ })).toHaveCount(0);

    // the friend hears about it, finds it from the notification, and asks to be reminded
    const fan = await friend.context.newPage();
    await fan.goto("/");
    await fan.getByRole("button", { name: "Notifications" }).click();
    await expect(fan.getByText(new RegExp(`scheduled a live: "${title}"`))).toBeVisible();
    await fan.getByText(new RegExp(`scheduled a live: "${title}"`)).click();
    await expect(fan).toHaveURL(/\/live$/);
    const theirs = plans(fan).getByRole("listitem").filter({ hasText: title });
    await theirs.getByRole("button", { name: `Remind me about ${title}` }).click();
    await expect(theirs.getByRole("button", { name: `Stop reminding me about ${title}` })).toHaveAttribute("aria-pressed", "true");
    await expect(theirs).toContainText("1 reminding");

    // the host sees the count, then cancels it, and it is gone for the friend as well
    await page.reload();
    await expect(plans(page).getByRole("listitem").filter({ hasText: title })).toContainText("1 reminding");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: `Cancel ${title}` }).click();
    await expect(plans(page).getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
    await fan.reload();
    await expect(plans(fan).getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
    await fan.getByRole("button", { name: "Notifications" }).click();
    await expect(fan.getByText(new RegExp(`scheduled a live: "${title}"`))).toHaveCount(0); // the announcement went with it
    await friend.context.close();
  });

  test("a live that is about to start sends the reminder to those who asked, and the host", async ({ page, browser, baseURL }) => {
    const me = newUser("soonhost");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "waiter");
    const stranger = await apiUser(browser, baseURL!, "bystander");
    await befriend(page.request, friend.request, me.username);

    const title = uniq("Starts soon");
    const made = await page.request.post("/api/scheduled-lives", { data: { title, startsAt: new Date(Date.now() + 6 * 60_000).toISOString() } });
    expect(made.status()).toBe(201);
    const id = (await made.json()).scheduled.id;
    expect((await friend.request.post(`/api/scheduled-lives/${id}/remind`)).status()).toBe(200);

    // six minutes out is inside the reminder window, so looking at the notifications sends it
    // (the server checks for due reminders at most every 15 seconds, so look again until it has)
    const fan = await friend.context.newPage();
    const reminder = fan.getByText(new RegExp(`has a live starting soon: "${title}"`));
    await expect(async () => {
      await fan.goto("/");
      await fan.getByRole("button", { name: "Notifications" }).click();
      await expect(reminder).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 90_000, intervals: [2_000] });
    await reminder.click();
    await expect(fan).toHaveURL(/\/live$/);

    await expect(async () => {
      await bell(page);
      await expect(page.getByText(new RegExp(`your live "${title}" starts soon`))).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 60_000, intervals: [1_000] });

    const other = await stranger.request.get("/api/notifications");
    expect(((await other.json()).notifications as { type: string }[]).filter((n) => n.type === "live_reminder")).toHaveLength(0); // didn't ask
    await friend.context.close();
    await stranger.context.close();
  });

  test("a time that is too soon, or has no title, is refused", async ({ page }) => {
    await signUpViaUi(page, newUser("hasty"));
    await page.goto("/live");
    await page.getByLabel("Plan title").fill("Too soon");
    await page.getByLabel("Start time").fill(localInput(2));
    // Most browsers' time pickers say it is too early and send nothing; the rest send it and the server says so
    const pickerObjects = await page.getByLabel("Start time").evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow);
    let sent = false;
    page.on("request", (r) => (sent ||= r.url().endsWith("/api/scheduled-lives") && r.method() === "POST"));
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    if (pickerObjects) {
      await page.waitForTimeout(500);
      expect(sent).toBe(false);
    } else {
      await expect(page.getByRole("alert").filter({ hasText: "at least 5 minutes" })).toBeVisible();
    }
    // and the server holds the same line for anything that gets past the form
    const res = await page.request.post("/api/scheduled-lives", { data: { title: "Too soon", startsAt: new Date(Date.now() + 2 * 60_000).toISOString() } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/at least 5 minutes/);
    await page.getByLabel("Start time").fill(localInput(60));

    await page.getByLabel("Plan title").fill("");
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Give your live a title" })).toBeVisible();
  });

  test("starting a planned live closes the plan and tells people who asked to be reminded", async ({ page, browser, baseURL, browserName }) => {
    test.skip(browserName !== "chromium", "needs Chrome's fake microphone");
    const me = newUser("starter");
    await signUpViaUi(page, me);
    const asker = await apiUser(browser, baseURL!, "asker"); // not a friend, asked for a reminder
    const title = uniq("Go now");
    const made = await page.request.post("/api/scheduled-lives", { data: { title, startsAt: new Date(Date.now() + 90 * 60_000).toISOString() } });
    const id = (await made.json()).scheduled.id;
    expect((await asker.request.post(`/api/scheduled-lives/${id}/remind`)).status()).toBe(200);

    await page.goto("/live");
    await plans(page).getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Start now" }).click();
    await expect(page).toHaveURL(/\/live\/[a-f0-9]{24}$/);
    await expect(page.getByText("You're live — listeners can hear your microphone.")).toBeVisible();

    const list = await (await asker.request.get("/api/scheduled-lives")).json();
    expect((list.scheduled as { id: string }[]).some((p) => p.id === id)).toBe(false); // the plan is closed
    const told = ((await (await asker.request.get("/api/notifications")).json()).notifications as { type: string; payload: { title?: string } }[]).filter((n) => n.type === "live_started");
    expect(told.map((n) => n.payload.title)).toContain(title);
    await asker.context.close();
  });

  test("the schedule fits the screen, phone included", async ({ page }) => {
    await signUpViaUi(page, newUser("tidy"));
    const long = uniq("A rather long title for a live that goes on and on");
    await page.request.post("/api/scheduled-lives", { data: { title: long, startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString() } });
    await page.goto("/live");
    await expect(plans(page).getByRole("listitem").filter({ hasText: long })).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
