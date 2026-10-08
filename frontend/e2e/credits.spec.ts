import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiUser, befriend, expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

async function addPiece(page: import("@playwright/test").Page, caption: string) {
  const res = await page.request.post("/api/media", { data: { type: "image", url: `https://images.example.com/${caption.replace(/\W+/g, "-")}.jpg`, caption } });
  expect(res.status()).toBe(201);
  return (await res.json()).mediaItem.id as string;
}

// every colour on the page, as drawn, must be readable (the same check as e2e/contrast.spec.ts)
async function expectReadable(page: import("@playwright/test").Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("credits on portfolio pieces", () => {
  test("the owner credits a friend, the friend accepts, and it shows on the piece and as a collaboration", async ({ page, browser, baseURL }) => {
    const owner = newUser("maker");
    await signUpViaUi(page, owner);
    const friend = await secondBrowserUser(browser, baseURL!, "helper");
    await befriend(page.request, friend.context.request, owner.username);
    const stranger = await apiUser(browser, baseURL!, "passerby");
    await addPiece(page, "Harbour mural");

    // the owner credits the friend, with what they did
    await page.goto(`/u/${owner.username}`);
    await page.getByRole("button", { name: "+ Credit someone" }).click();
    await page.getByRole("combobox", { name: "Who worked on it" }).selectOption({ label: friend.user.displayName });
    await page.getByRole("textbox", { name: "What they did (e.g. illustrator)" }).fill("Lettering");
    await page.getByRole("button", { name: "Ask" }).click();
    const withList = page.getByRole("list", { name: "Who worked on this" });
    await expect(withList).toContainText(friend.user.displayName);
    await expect(withList).toContainText("waiting for them");

    // until the friend says yes, strangers see nothing
    const piecesOf = async () => (await (await stranger.request.get(`/api/media/user/${owner.username}`)).json()).media[0].credits;
    expect(await piecesOf()).toEqual([]);

    // the friend is told, sees the request on their own portfolio, and accepts
    await expect.poll(async () => (await (await friend.context.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "credit_request")).toBe(true);
    await friend.page.goto(`/u/${friend.user.username}`);
    const requests = friend.page.getByRole("region", { name: "Credits waiting for you" });
    await expect(requests).toContainText(`${owner.displayName} credited you as Lettering`);
    await requests.getByRole("button", { name: "Accept" }).click();
    await expect(requests).toHaveCount(0);

    // it now shows to everyone, and the piece is a collaboration on the friend's profile
    await expect.poll(async () => (await piecesOf()).map((c: { role: string }) => c.role)).toEqual(["Lettering"]);
    await expect(friend.page.getByRole("region", { name: "Collaborations" })).toContainText("Lettering");
    await friend.page.getByRole("link", { name: /Lettering/ }).click();
    await expect(friend.page).toHaveURL(new RegExp(`/u/${owner.username}`));
    await expect(friend.page.getByRole("list", { name: "Who worked on this" })).toContainText(friend.user.displayName);
    await expectNoHorizontalOverflow(friend.page);
    await expectReadable(friend.page, "a piece with credits");
    await friend.page.goto(`/u/${friend.user.username}`);
    await expectReadable(friend.page, "a profile with collaborations");
    await page.reload();
    await page.getByRole("button", { name: "+ Credit someone" }).first().click();
    await expectReadable(page, "the credit form");

    // the owner was told it was accepted
    await expect.poll(async () => (await (await page.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "credit_accepted")).toBe(true);

    await friend.context.close();
    await stranger.context.close();
  });

  test("a credit can be declined, and an accepted one can be left or taken off", async ({ page, browser, baseURL }) => {
    const owner = newUser("author");
    await signUpViaUi(page, owner);
    const friend = await apiUser(browser, baseURL!, "pal");
    await befriend(page.request, friend.request, owner.username);
    const pieceId = await addPiece(page, "Cover art");

    // asked, then declined: nothing is left
    let made = await page.request.post(`/api/credits/for/${pieceId}`, { data: { username: friend.user.username, role: "Colourist" } });
    expect(made.status()).toBe(201);
    const declined = await friend.request.delete(`/api/credits/${(await made.json()).credit.id}`);
    expect(declined.status()).toBe(204);
    await page.goto(`/u/${owner.username}`);
    await expect(page.getByRole("list", { name: "Who worked on this" })).toHaveCount(0);

    // asked again and accepted: the owner can take it off from the piece
    made = await page.request.post(`/api/credits/for/${pieceId}`, { data: { username: friend.user.username, role: "Colourist" } });
    await friend.request.post(`/api/credits/${(await made.json()).credit.id}/accept`);
    await page.reload();
    const list = page.getByRole("list", { name: "Who worked on this" });
    await expect(list).toContainText("Colourist");
    await page.getByRole("button", { name: `Take ${friend.user.displayName}'s credit off this piece` }).click();
    await expect(list).toHaveCount(0);
    expect((await (await friend.request.get(`/api/credits/user/${friend.user.username}`)).json()).collaborations).toEqual([]);
    await friend.context.close();
  });

  test("only friends can be credited, and it is said plainly", async ({ page, browser, baseURL }) => {
    const owner = newUser("careful");
    await signUpViaUi(page, owner);
    const stranger = await apiUser(browser, baseURL!, "outsider");
    const pieceId = await addPiece(page, "Sketch");
    const res = await page.request.post(`/api/credits/for/${pieceId}`, { data: { username: stranger.user.username, role: "Helper" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("You can only credit your friends");
    await stranger.context.close();
  });

  test("in Arabic the credits read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    const owner = newUser("arabicmaker");
    await signUpViaUi(page, owner);
    const friend = await apiUser(browser, baseURL!, "arabichelper");
    await befriend(page.request, friend.request, owner.username);
    const pieceId = await addPiece(page, "Mural");
    const made = await page.request.post(`/api/credits/for/${pieceId}`, { data: { username: friend.user.username, role: "رسّام" } });
    await friend.request.post(`/api/credits/${(await made.json()).credit.id}/accept`);
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/u/${owner.username}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("list", { name: "من عمل على هذا" })).toContainText("رسّام");
    await expectNoHorizontalOverflow(page);
    await friend.context.close();
  });
});
