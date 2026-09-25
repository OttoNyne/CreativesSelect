import { expect, test, type Page } from "@playwright/test";
import { apiUser, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

async function openOwnProfile(page: Page, label: string) {
  const user = newUser(label);
  await signUpViaUi(page, user);
  await page.goto(`/u/${user.username}`);
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  return user;
}

// The mock AI provider (used when no AI credentials are set, as in CI) returns an inline image.
async function addGeneratedPicture(page: Page, prompt = "a red kite over hills") {
  await page.getByPlaceholder("Describe an image to generate…").fill(prompt);
  await page.getByRole("button", { name: "🖼️ Generate", exact: true }).click();
  await expect(page.locator("img[alt]").first()).toBeVisible();
}

test.describe("portfolio pictures", () => {
  test("generate a picture, react to it, and remove it (the ✕ is always visible)", async ({ page }) => {
    await openOwnProfile(page, "artist");
    await addGeneratedPicture(page);
    await expect(page.getByText("AI", { exact: true })).toBeVisible();

    // The remove button must be visible without hovering — phones have no hover.
    const remove = page.getByRole("button", { name: "Remove from portfolio" });
    await expect(remove).toBeVisible();

    const like = page.getByRole("button", { name: "Like", exact: true });
    const dislike = page.getByRole("button", { name: "Dislike", exact: true });
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(like).toContainText("1");
    await dislike.click(); // switch
    await expect(dislike).toHaveAttribute("aria-pressed", "true");
    await expect(like).toContainText("0");
    await expect(dislike).toContainText("1");
    await dislike.click(); // clear
    await expect(dislike).toHaveAttribute("aria-pressed", "false");
    await expect(dislike).toContainText("0");

    page.once("dialog", (d) => d.accept());
    await remove.click();
    await expect(page.getByText("No portfolio pieces yet.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No portfolio pieces yet.")).toBeVisible();
  });

  test("cancelling the confirmation keeps the picture", async ({ page }) => {
    await openOwnProfile(page, "keeper");
    await addGeneratedPicture(page);
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "Remove from portfolio" }).click();
    await expect(page.getByRole("button", { name: "Remove from portfolio" })).toBeVisible();
  });

  test("other people can like and dislike your pictures, and you see the counts", async ({ page, browser, baseURL }) => {
    const owner = await openOwnProfile(page, "showoff");
    await addGeneratedPicture(page);

    const fan = await apiUser(browser, baseURL!, "fan");
    const list = await (await fan.request.get(`/api/media/user/${owner.username}`)).json();
    const res = await fan.request.put(`/api/media/${list.media[0].id}/reaction`, { data: { value: 1 } });
    expect(res.status()).toBe(200);

    await page.reload();
    await expect(page.getByRole("button", { name: "Like", exact: true })).toContainText("1");
    await expect(page.getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "false"); // that's the fan's like
    await fan.context.close();
  });

  test("visitors see a picture and can't remove it", async ({ page, browser, baseURL }) => {
    const owner = await openOwnProfile(page, "gallery");
    await addGeneratedPicture(page);

    const visitor = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const vpage = await visitor.newPage();
    await vpage.goto(`/u/${owner.username}`);
    await expect(vpage.locator("img[alt]").first()).toBeVisible();
    await expect(vpage.getByRole("button", { name: "Remove from portfolio" })).toHaveCount(0);
    await expect(vpage.getByRole("button", { name: "Like", exact: true })).toBeDisabled(); // signed out: can look, can't react
    await visitor.close();
  });
});

test.describe("portfolio videos", () => {
  test("a YouTube link becomes a 30-second embed", async ({ page }) => {
    await openOwnProfile(page, "yt");
    await expect(page.getByText(/up to 30 seconds and 30 MB/)).toBeVisible();
    await page.getByRole("button", { name: "+ Video link" }).click();
    await page.getByLabel("Video link").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Start time in seconds").fill("20");
    await page.getByRole("button", { name: "Add video" }).click();

    const frame = page.locator("iframe[src*='youtube-nocookie.com']");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("src", /embed\/dQw4w9WgXcQ\?start=20&end=50/);

    await page.reload();
    await expect(page.locator("iframe[src*='youtube-nocookie.com']")).toBeVisible();
  });

  test("a direct video link plays as a clipped <video>", async ({ page }) => {
    await openOwnProfile(page, "direct");
    await page.getByRole("button", { name: "+ Video link" }).click();
    await page.getByLabel("Video link").fill("https://cdn.example.com/clips/demo.mp4");
    await page.getByRole("button", { name: "Add video" }).click();
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", "https://cdn.example.com/clips/demo.mp4#t=0,30");
    await expect(video).toHaveAttribute("controls", "");
  });

  test("an unsupported or unsafe link is refused with the reason, and nothing is added", async ({ page }) => {
    await openOwnProfile(page, "badlink");
    await page.getByRole("button", { name: "+ Video link" }).click();
    for (const link of ["https://vimeo.com/123456", "http://youtu.be/dQw4w9WgXcQ", "javascript:alert(1)"]) {
      await page.getByLabel("Video link").fill(link);
      await page.getByRole("button", { name: "Add video" }).click();
      await expect(page.getByText(/YouTube link or a direct|start with https|doesn't look like a link/)).toBeVisible();
      await expect(page.getByText("No portfolio pieces yet.")).toBeVisible();
    }
  });
});
