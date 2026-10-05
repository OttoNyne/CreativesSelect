import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

const videoId = (i: number) => `dQw4w9WgX${String(i).padStart(2, "0")}`; // a video id is 11 characters

test.describe("music", () => {
  test("the owner names a song, picks the profile song, and a visitor plays it and is counted", async ({ page, browser, baseURL }) => {
    const owner = newUser("musician");
    await signUpViaUi(page, owner);
    for (const [i, title] of ["First", "Second"].entries()) {
      expect((await page.request.post("/api/tracks", { data: { title, sourceType: "youtube", url: videoId(i) } })).status()).toBe(201);
    }
    await page.goto(`/u/${owner.username}`);
    await expect(page.getByText("2/20")).toBeVisible();

    // name the artist and rename
    await page.getByRole("button", { name: "Edit First" }).click();
    await page.getByLabel("Track title").fill("First light");
    await page.getByLabel("Artist", { exact: true }).fill("The Band");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("First light")).toBeVisible();
    await expect(page.getByText("The Band · YouTube")).toBeVisible();

    // pick the profile song; it is marked, and moves when another is chosen
    await page.getByRole("button", { name: "Make Second the profile song" }).click();
    await expect(page.getByRole("button", { name: "▶ Play profile song: Second" })).toBeVisible();
    await page.getByRole("button", { name: "Make First light the profile song" }).click();
    await expect(page.getByRole("button", { name: "▶ Play profile song: First light" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "▶ Play profile song: First light" })).toBeVisible();
    await expect(page.getByText("Profile song", { exact: true })).toHaveCount(1);

    // a visitor sees it, can't change anything, plays it (it never starts by itself) and is counted after a few seconds
    const visitor = await secondBrowserUser(browser, baseURL!, "listener");
    await visitor.page.goto(`/u/${owner.username}`);
    await expect(visitor.page.getByRole("button", { name: "▶ Play profile song: First light" })).toBeVisible();
    await expect(visitor.page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
    await visitor.page.getByRole("button", { name: "▶ Play profile song: First light" }).click();
    await expect
      .poll(async () => ((await (await visitor.context.request.get(`/api/profiles/${owner.username}/tracks`)).json()).tracks as { title: string; plays: number }[]).find((t) => t.title === "First light")?.plays, { timeout: 30_000 })
      .toBe(1);
    await visitor.page.reload();
    await expect(visitor.page.getByText("The Band · YouTube · 1 play")).toBeVisible();

    // the owner's own listening doesn't count
    await page.getByRole("button", { name: "▶ Play profile song: First light" }).click();
    await page.waitForTimeout(12_000);
    const after = (await (await page.request.get(`/api/profiles/${owner.username}/tracks`)).json()).tracks as { title: string; plays: number }[];
    expect(after.find((t) => t.title === "First light")?.plays).toBe(1);
    await visitor.context.close();
  });

  test("a playlist holds twenty tracks, and says so", async ({ page }) => {
    const owner = newUser("collector");
    await signUpViaUi(page, owner);
    for (let i = 0; i < 20; i++) {
      expect((await page.request.post("/api/tracks", { data: { title: `Song ${i}`, sourceType: "youtube", url: videoId(i) } })).status(), `track ${i}`).toBe(201);
    }
    expect((await page.request.post("/api/tracks", { data: { title: "One too many", sourceType: "youtube", url: videoId(21) } })).status()).toBe(400);
    await page.goto(`/u/${owner.username}`);
    await expect(page.getByText("20/20")).toBeVisible();
    await expect(page.getByText("Remove a track to add another.")).toBeVisible();
    await page.getByRole("button", { name: "Remove Song 3" }).click();
    await expect(page.getByText("19/20")).toBeVisible();
    await expect(page.getByPlaceholder("Paste a YouTube link…")).toBeVisible();
  });
});
