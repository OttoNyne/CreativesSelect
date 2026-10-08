import { expect, test, type Page } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const albumBar = (page: Page) => page.getByRole("list", { name: "Albums" });
const pieces = (page: Page) => page.locator("img[alt^='Piece ']");
/** Add a picture to the portfolio by link, with a caption we can find it by. */
async function addPiece(page: Page, n: number) {
  const res = await page.request.post("/api/media", { data: { type: "image", url: `https://images.example.com/e2e-${n}.jpg`, caption: `Piece ${n}` } });
  expect(res.status()).toBe(201);
  return (await res.json()).mediaItem.id as string;
}

test.describe("portfolio albums", () => {
  test("the owner makes an album, fills it, and a visitor can browse it; deleting it keeps the pieces", async ({ page, browser, baseURL }) => {
    const me = newUser("curator");
    await signUpViaUi(page, me);
    for (const n of [1, 2, 3]) await addPiece(page, n);
    const visitor = await secondBrowserUser(browser, baseURL!, "viewer");

    await page.goto(`/u/${me.username}`);
    await expect(pieces(page)).toHaveCount(3);
    await expect(albumBar(page)).toBeVisible(); // the owner can always start one
    await expect(visitor.page.getByRole("list", { name: "Albums" })).toHaveCount(0);

    // make an album, then put two pieces in it from their menus
    await page.getByRole("button", { name: "+ New album" }).click();
    await page.getByLabel("Album name").fill("Sketchbook");
    await page.getByRole("button", { name: "Create album" }).click();
    await expect(page.getByRole("button", { name: "Sketchbook (0)", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "All pieces (3)" }).click();
    for (const n of [1, 3]) await page.getByRole("combobox", { name: `Album for Piece ${n}` }).selectOption({ label: "Sketchbook" });
    await expect(page.getByRole("button", { name: "Sketchbook (2)" })).toBeVisible();
    await page.getByRole("button", { name: "Sketchbook (2)" }).click();
    await expect(pieces(page)).toHaveCount(2);
    await expect(page.locator("img[alt='Piece 2']")).toHaveCount(0);

    // it is saved: a visitor sees the album and can browse it, but has no controls
    await visitor.page.goto(`/u/${me.username}`);
    await expect(albumBar(visitor.page)).toBeVisible();
    await expect(visitor.page.getByRole("button", { name: "All pieces (3)" })).toBeVisible();
    await visitor.page.getByRole("button", { name: "Sketchbook (2)" }).click();
    await expect(pieces(visitor.page)).toHaveCount(2);
    await expect(visitor.page.getByRole("button", { name: "+ New album" })).toHaveCount(0);
    await expect(visitor.page.getByRole("combobox", { name: /^Album for/ })).toHaveCount(0);

    // rename it
    await page.getByRole("button", { name: "Rename this album" }).click();
    await page.getByLabel("New name for this album").fill("Studio sketches");
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(page.getByRole("button", { name: "Studio sketches (2)" })).toBeVisible();

    // delete it: the pieces stay
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete this album" }).click();
    await expect(page.getByRole("button", { name: "All pieces (3)" })).toHaveAttribute("aria-pressed", "true");
    await expect(pieces(page)).toHaveCount(3);
    await page.reload();
    await expect(pieces(page)).toHaveCount(3);
    await visitor.context.close();
  });

  test("a duplicate name is refused with the reason, and an album can't hold someone else's piece", async ({ page, browser, baseURL }) => {
    const me = newUser("tidy");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    for (const name of ["Murals", "murals"]) {
      await page.getByRole("button", { name: "+ New album" }).click();
      await page.getByLabel("Album name").fill(name);
      await page.getByRole("button", { name: "Create album" }).click();
      if (name === "murals") await expect(page.getByRole("alert")).toContainText("already have an album");
    }
    await page.getByRole("button", { name: "Cancel" }).click();

    // someone else can't put their piece in this album or move this person's piece
    const mine = (await (await page.request.get("/api/albums/user/" + me.username)).json()).albums[0].id as string;
    const other = await secondBrowserUser(browser, baseURL!, "meddler");
    const theirPiece = await other.context.request.post("/api/media", { data: { type: "image", url: "https://images.example.com/theirs.jpg" } });
    const theirId = (await theirPiece.json()).mediaItem.id;
    expect((await other.context.request.patch(`/api/media/${theirId}`, { data: { album: mine } })).status()).toBe(404);
    const myPiece = await addPiece(page, 9);
    expect((await other.context.request.patch(`/api/media/${myPiece}`, { data: { album: null } })).status()).toBe(404);
    expect((await other.context.request.delete(`/api/albums/${mine}`)).status()).toBe(404);
    await other.context.close();
  });

  test("a private profile's albums are not shown to a stranger", async ({ page, browser, baseURL }) => {
    const me = newUser("hidden");
    await signUpViaUi(page, me);
    expect((await page.request.post("/api/albums", { data: { title: "Secret" } })).status()).toBe(201);
    expect((await page.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    const stranger = await secondBrowserUser(browser, baseURL!, "nosy");
    expect((await stranger.context.request.get(`/api/albums/user/${me.username}`)).status()).toBe(403);
    await stranger.context.close();
  });
});
