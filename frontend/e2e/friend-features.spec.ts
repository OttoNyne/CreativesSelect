import { expect, test } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

test.describe("friend features", () => {
  test("mutual friends on a profile, people you may know, dismissing one, and the privacy switch", async ({ page, browser, baseURL }) => {
    const me = newUser("socialite");
    await signUpViaUi(page, me);
    const connector = await apiUser(browser, baseURL!, "connector");
    const stranger = await apiUser(browser, baseURL!, "stranger");
    const other = await apiUser(browser, baseURL!, "other");
    await befriend(page.request, connector.request, me.username); // me <-> connector
    await befriend(connector.request, stranger.request, connector.user.username); // connector <-> stranger
    await befriend(connector.request, other.request, connector.user.username); // connector <-> other

    // the friends page suggests the connector's friends, with who we share
    await page.goto("/friends");
    const section = page.getByRole("region", { name: "People you may know" });
    await expect(section).toBeVisible();
    await expect(section.getByRole("link", { name: new RegExp(stranger.user.displayName) })).toBeVisible();
    await expect(section.getByRole("link", { name: new RegExp(other.user.displayName) })).toBeVisible();
    await expect(section.getByText(new RegExp(`1 mutual friend: ${connector.user.displayName}`)).first()).toBeVisible();

    // add one, and say no to the other
    await section.locator("div", { has: page.getByRole("link", { name: new RegExp(stranger.user.displayName) }) }).getByRole("button", { name: "Add friend" }).first().click();
    await expect(section.getByRole("button", { name: "Request sent" })).toBeVisible();
    await section.getByRole("button", { name: new RegExp(`Not interested in ${other.user.displayName}`) }).click();
    await expect(section.getByRole("link", { name: new RegExp(other.user.displayName) })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "People you may know" }).getByRole("link", { name: new RegExp(other.user.displayName) })).toHaveCount(0); // it stays dismissed

    // someone else's profile shows the friends we share
    await page.goto(`/u/${stranger.user.username}`);
    const mutual = page.getByRole("region", { name: "Mutual friends" });
    await expect(mutual).toContainText("1 mutual friend:");
    await expect(mutual.getByRole("link", { name: new RegExp(connector.user.displayName) })).toBeVisible();
    await mutual.getByRole("link", { name: new RegExp(connector.user.displayName) }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${connector.user.username}$`));

    // a person who switches it off is no longer named, or suggested
    expect((await stranger.request.patch("/api/profiles/me", { data: { showConnections: false } })).status()).toBe(200);
    await page.goto(`/u/${stranger.user.username}`);
    await expect(page.getByRole("heading", { name: stranger.user.displayName })).toBeVisible();
    await expect(page.getByRole("region", { name: "Mutual friends" })).toHaveCount(0);
    const suggestions = await (await page.request.get("/api/friends/suggestions")).json();
    expect(suggestions.suggestions.map((s: { user: { username: string } }) => s.user.username)).not.toContain(stranger.user.username);
  });

  test("top friends can be put in the order you like", async ({ page, browser, baseURL }) => {
    const me = newUser("ranker");
    await signUpViaUi(page, me);
    const first = await apiUser(browser, baseURL!, "first");
    const second = await apiUser(browser, baseURL!, "second");
    await befriend(page.request, first.request, me.username);
    await befriend(page.request, second.request, me.username);

    await page.goto(`/u/${me.username}`);
    await page.locator("h2", { hasText: "Top Friends" }).locator("xpath=..").getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByText(first.user.displayName, { exact: true }).last().click();
    await page.getByText(second.user.displayName, { exact: true }).last().click();
    const list = page.getByRole("list", { name: "Your top friends, in order" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: `Move ${second.user.displayName} up` }).click();
    await page.getByRole("button", { name: /^Save/ }).click();

    await expect
      .poll(async () => ((await (await page.request.get(`/api/profiles/${me.username}/top-friends`)).json()).topFriends as { username: string }[]).map((f) => f.username))
      .toEqual([second.user.username, first.user.username]);
    // and the profile shows them in that order
    await page.reload();
    const firstBox = await page.getByRole("link", { name: new RegExp(first.user.displayName) }).first().boundingBox();
    const secondBox = await page.getByRole("link", { name: new RegExp(second.user.displayName) }).first().boundingBox();
    expect(secondBox!.x + secondBox!.y).toBeLessThan(firstBox!.x + firstBox!.y + 1); // the second is shown first (left of, or above, the first)
  });
});
