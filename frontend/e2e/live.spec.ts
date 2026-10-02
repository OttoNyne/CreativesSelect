import { expect, test, type Page } from "@playwright/test";
import { apiUser, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// Lives are visible to everyone, and the three browser projects share one database, so each run uses its own title.
const uniq = (title: string) => `${title} ${Math.random().toString(36).slice(2, 7)}`;

// Reads a short stretch of the audio that's actually playing and returns the loudest sample.
// Silence is 0, so anything above it means sound really arrived over the connection.
async function loudestSample(page: Page, ms = 4000): Promise<number> {
  return page.evaluate(async (duration) => {
    const audio = document.querySelector("audio") as HTMLAudioElement | null;
    const stream = audio?.srcObject as MediaStream | null;
    if (!stream || stream.getAudioTracks().length === 0) return -1;
    const ctx = new AudioContext();
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let loudest = 0;
    const end = Date.now() + duration;
    while (Date.now() < end && loudest === 0) {
      analyser.getFloatTimeDomainData(data);
      for (const v of data) loudest = Math.max(loudest, Math.abs(v));
      await new Promise((r) => setTimeout(r, 50));
    }
    await ctx.close();
    return loudest;
  }, ms);
}

test.describe("voice live: real audio between two browsers", () => {
  test("a host goes live, a listener hears them, chat works both ways, and ending the live tells the listener", async ({ page, browser, baseURL, browserName }) => {
    test.skip(browserName !== "chromium", "needs a fake microphone, which only Chrome can provide");
    test.setTimeout(120_000);

    // The host goes live from the Live page.
    const host = newUser("broadcaster");
    await signUpViaUi(page, host);
    await page.goto("/live");
    const beats = uniq("Late night beats");
    await page.getByLabel("Live title").fill(beats);
    await page.getByRole("button", { name: "Go live", exact: true }).click();
    await expect(page).toHaveURL(/\/live\/[a-f0-9]{24}$/);
    await expect(page.getByText("You're live — listeners can hear your microphone.")).toBeVisible();

    // Someone else finds it in the list and listens.
    const fan = await secondBrowserUser(browser, baseURL!, "listener");
    await fan.page.goto("/live");
    await fan.page.getByRole("link", { name: new RegExp(beats) }).click();
    await expect(fan.page.getByRole("heading", { name: beats })).toBeVisible();
    await fan.page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect(fan.page.getByText("Listening live")).toBeVisible({ timeout: 40_000 });

    // Sound actually arrives (the fake microphone plays a test tone).
    expect(await loudestSample(fan.page)).toBeGreaterThan(0);

    // The host sees the listener (the count refreshes with each heartbeat).
    await expect(page.getByText("1 listening")).toBeVisible({ timeout: 25_000 });

    // Chat, both directions.
    await fan.page.getByLabel("Comment", { exact: true }).fill("This is great!");
    await fan.page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("This is great!")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Comment", { exact: true }).fill("Thanks for tuning in");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(fan.page.getByText("Thanks for tuning in")).toBeVisible({ timeout: 15_000 });

    // Muting is reflected on the host's screen (the fake microphone's tone has natural gaps, so silence itself can't be asserted reliably).
    await page.getByRole("button", { name: "Mute microphone" }).click();
    await expect(page.getByText("Your microphone is muted")).toBeVisible();

    // Ending the live tells the listener, and it leaves the list.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "End live" }).click();
    await expect(page).toHaveURL(/\/live$/);
    await expect(fan.page.getByText("This live has ended.")).toBeVisible({ timeout: 25_000 });
    await fan.page.goto("/live");
    await expect(fan.page.getByRole("heading", { name: "Live now" })).toBeVisible();
    await expect(fan.page.getByRole("link", { name: new RegExp(beats) })).toHaveCount(0);
    await fan.context.close();
  });

  test("leaving the host's page ends the live", async ({ page, browser, baseURL, browserName }) => {
    test.skip(browserName !== "chromium", "needs a fake microphone, which only Chrome can provide");
    const host = newUser("walkaway");
    await signUpViaUi(page, host);
    await page.goto("/live");
    const brief = uniq("Brief live");
    await page.getByLabel("Live title").fill(brief);
    await page.getByRole("button", { name: "Go live", exact: true }).click();
    await expect(page).toHaveURL(/\/live\/[a-f0-9]{24}$/);
    await expect(page.getByText("You're live")).toBeVisible();

    const other = await apiUser(browser, baseURL!, "watcher");
    // (other tests may have lives of their own running, so look only at this one)
    const briefLives = async () =>
      ((await (await other.request.get("/api/live")).json()).lives as { title: string }[]).filter((l) => l.title === brief).length;
    expect(await briefLives()).toBe(1);

    await page.getByRole("link", { name: "CreativesSelect" }).click(); // away from the room
    await expect.poll(briefLives, { timeout: 15_000 }).toBe(0);
    await other.context.close();
  });
});

test.describe("voice live: the room, with the host simulated through the API", () => {
  async function liveByApi(browser: Parameters<typeof apiUser>[0], baseURL: string, title: string) {
    const host = await apiUser(browser, baseURL, "dj");
    const res = await host.request.post("/api/live", { data: { title } });
    expect(res.status()).toBe(201);
    const id = (await res.json()).live.id as string;
    // A real host sends a heartbeat every few seconds (a silent host's live ends after 45 s); slow browsers need that here too.
    const beat = setInterval(() => void host.request.post(`/api/live/${id}/heartbeat`).catch(() => clearInterval(beat)), 5000);
    return { host, id };
  }

  test("a live shows in the list, and a listener can join, chat and leave", async ({ page, browser, baseURL }) => {
    const me = newUser("tuner");
    await signUpViaUi(page, me);
    const openMicTitle = uniq("Open mic");
    const { host, id } = await liveByApi(browser, baseURL!, openMicTitle);

    await page.goto("/live");
    const card = page.getByRole("link", { name: new RegExp(openMicTitle) });
    await expect(card).toContainText("0 listening");
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/live/${id}$`));
    await expect(page.getByText("Join the live to chat.")).toBeVisible();

    // Playwright's WebKit build ships without WebRTC; the page must say so rather than pretend (real Safari has it).
    if (!(await page.evaluate(() => typeof RTCPeerConnection !== "undefined"))) {
      await expect(page.getByText("This browser can't play live audio")).toBeVisible();
      await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeDisabled();
      expect(((await (await host.request.get(`/api/live/${id}`)).json()).live.listenerCount as number)).toBe(0); // and didn't join
      await host.context.close();
      return;
    }

    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect(page.getByLabel("Comment", { exact: true })).toBeVisible(); // joined: chat opens
    await page.getByLabel("Comment", { exact: true }).fill("Hello from the audience");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Hello from the audience")).toBeVisible();
    // the host sees it too
    await expect
      .poll(async () => ((await (await host.request.get(`/api/live/${id}/comments`)).json()).comments as { body: string }[]).map((c) => c.body))
      .toEqual(["Hello from the audience"]);

    await page.getByRole("button", { name: "Leave" }).click();
    await expect(page).toHaveURL(/\/live$/);
    await host.context.close();
  });

  test("a full room says so, and an ended live can't be joined", async ({ page, browser, baseURL }) => {
    const me = newUser("late");
    await signUpViaUi(page, me);
    const packedTitle = uniq("Packed room");
    const { host, id } = await liveByApi(browser, baseURL!, packedTitle);
    const fans = [];
    for (let i = 0; i < 8; i++) {
      const fan = await apiUser(browser, baseURL!, `fan${i}`);
      expect((await fan.request.post(`/api/live/${id}/join`)).status()).toBe(200);
      fans.push(fan);
    }

    await page.goto(`/live/${id}`);
    await expect(page.getByRole("button", { name: "This live is full" })).toBeDisabled();

    expect((await host.request.post(`/api/live/${id}/end`)).status()).toBe(204);
    await page.goto(`/live/${id}`);
    await expect(page.getByText("This live has ended.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Listen", exact: true })).toHaveCount(0);
    for (const f of fans) await f.context.close();
    await host.context.close();
  });

  test("a live that doesn't exist, or is hidden from you, looks the same", async ({ page, browser, baseURL }) => {
    const me = newUser("snoop");
    await signUpViaUi(page, me);
    await page.goto("/live/507f1f77bcf86cd799439011");
    await expect(page.getByText("This live isn't available.")).toBeVisible();

    // a live whose host has blocked me can't be seen either
    const partyTitle = uniq("Private party");
    const { host, id } = await liveByApi(browser, baseURL!, partyTitle);
    expect((await host.request.post(`/api/users/${me.username}/block`)).status()).toBe(204);
    await page.goto(`/live/${id}`);
    await expect(page.getByText("This live isn't available.")).toBeVisible();
    await page.goto("/live");
    await expect(page.getByRole("heading", { name: "Live now" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(partyTitle) })).toHaveCount(0);
    await host.context.close();
  });
});
