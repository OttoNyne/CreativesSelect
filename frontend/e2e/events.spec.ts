import { expect, test } from "@playwright/test";
import { befriend, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

/** A datetime-local value (the browser's own time zone) for some days ahead at a given hour. */
function inDays(days: number, hour = 19): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test.describe("events", () => {
  test("a host plans an event, a friend is told and says going, the host changes the place and then cancels it", async ({ page, browser, baseURL }) => {
    const host = newUser("organiser");
    await signUpViaUi(page, host);
    const guest = await secondBrowserUser(browser, baseURL!, "guest");
    await befriend(page.request, guest.context.request, host.username);

    // the host plans it
    await page.goto("/events");
    await expect(page.getByText(/Nothing is planned yet/)).toBeVisible();
    await page.getByRole("button", { name: "Plan an event" }).click();
    await page.getByLabel("Title").fill("Life drawing night");
    await page.getByLabel("Place").fill("The Old Mill, Leeds");
    await page.getByLabel("Starts").fill(inDays(3));
    await page.getByLabel("Details (optional)").fill("Bring pencils and paper");
    await page.getByRole("button", { name: "Plan event" }).click();
    await expect(page.getByRole("link", { name: "Life drawing night" })).toBeVisible();

    // the friend is told, finds it, and says going
    await guest.page.goto("/");
    await guest.page.getByRole("button", { name: "Notifications" }).click();
    await expect(guest.page.getByText(/is planning an event: "Life drawing night"/)).toBeVisible();
    await guest.page.getByText(/is planning an event/).click();
    await expect(guest.page).toHaveURL(/\/events\/[a-f0-9]+$/);
    await expect(guest.page.getByRole("heading", { name: "Life drawing night" })).toBeVisible();
    await expect(guest.page.getByText("Bring pencils and paper")).toBeVisible();
    await guest.page.getByRole("button", { name: "Going", exact: true }).click();
    await expect(guest.page.getByRole("button", { name: "Going", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(guest.page.getByRole("region", { name: "Going (1)" })).toBeVisible();

    // the host sees who is going, then changes the place
    await page.getByRole("link", { name: "Life drawing night" }).click();
    await expect(page.getByRole("region", { name: "Going (1)" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Going (1)" }).getByRole("link", { name: new RegExp(guest.user.displayName) })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Place").fill("The New Mill, Leeds");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("The New Mill, Leeds")).toBeVisible();
    await expect(page.getByText("(edited)")).toBeVisible();

    // the friend is told about the change
    await guest.page.goto("/");
    await guest.page.getByRole("button", { name: "Notifications" }).click();
    await expect(guest.page.getByText(/changed an event you answered: "Life drawing night" — the place changed/)).toBeVisible();

    // the host cancels; the friend is told and it is gone
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Cancel event" }).click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByText(/Nothing is planned yet/)).toBeVisible();
    await guest.page.goto("/");
    await guest.page.getByRole("button", { name: "Notifications" }).click();
    await expect(guest.page.getByText(/cancelled an event: "Life drawing night"/)).toBeVisible();
    await guest.page.goto("/events");
    await expect(guest.page.getByText(/Nothing is planned yet/)).toBeVisible();
    await guest.context.close();
  });

  test("a friends-only event is hidden from strangers, and its calendar file downloads for friends", async ({ page, browser, baseURL }) => {
    const host = newUser("closedhost");
    await signUpViaUi(page, host);
    const made = await page.request.post("/api/events", { data: { title: "Closed session", kind: "online", link: "https://meet.example.com/room", startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() } });
    expect(made.status()).toBe(201);
    const id = (await made.json()).event.id as string;

    const stranger = await secondBrowserUser(browser, baseURL!, "stranger");
    expect((await stranger.context.request.get(`/api/events/${id}`)).status()).toBe(404);
    await stranger.page.goto(`/events/${id}`);
    await expect(stranger.page.getByRole("alert")).toContainText("Event not found");
    await stranger.page.goto("/events");
    await expect(stranger.page.getByText("Closed session")).toHaveCount(0);

    const ics = await page.request.get(`/api/events/${id}/calendar.ics`);
    expect(ics.status()).toBe(200);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain("SUMMARY:Closed session");
    await stranger.context.close();
  });
});
