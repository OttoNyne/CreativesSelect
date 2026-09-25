import { expect, test } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

test.describe("finding people and making friends", () => {
  test("search finds someone, their profile offers Add Friend, and once accepted they're in your friends list", async ({ page, browser, baseURL }) => {
    const me = newUser("seeker");
    await signUpViaUi(page, me);
    const them = await apiUser(browser, baseURL!, "findable");

    await page.goto("/search");
    await page.getByPlaceholder("Search creatives…").fill(them.user.username.slice(0, 12));
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("link", { name: new RegExp(them.user.displayName) }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${them.user.username}$`));

    await page.getByRole("button", { name: "Add Friend" }).click();
    await expect(page.getByRole("button", { name: "Request sent" })).toBeDisabled();

    // They accept (via their own session), and it shows up on both sides.
    const pending = await (await them.request.get("/api/friends/requests")).json();
    expect(pending.requests).toHaveLength(1);
    expect((await them.request.post(`/api/friends/accept/${pending.requests[0].id}`)).status()).toBe(200);

    await page.goto("/friends");
    await expect(page.getByRole("link", { name: new RegExp(them.user.displayName) })).toBeVisible();
    await expect(page.getByText(/Friends \(1\)/)).toBeVisible();
    await them.context.close();
  });

  test("a friend request can be accepted from the Friends page", async ({ page, browser, baseURL }) => {
    const me = newUser("receiver");
    await signUpViaUi(page, me);
    const sender = await apiUser(browser, baseURL!, "sender");
    expect((await sender.request.post(`/api/friends/request/${me.username}`)).status()).toBe(201);

    await page.goto("/friends");
    await expect(page.getByText("Friend Requests")).toBeVisible();
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Friend Requests")).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(sender.user.displayName) })).toBeVisible();

    await page.getByRole("button", { name: "Unfriend" }).click();
    await expect(page.getByText(/No friends yet/)).toBeVisible();
    await sender.context.close();
  });

  test("you can block someone from their profile", async ({ page, browser, baseURL }) => {
    const me = newUser("blocker");
    await signUpViaUi(page, me);
    const other = await apiUser(browser, baseURL!, "annoying");
    await page.goto(`/u/${other.user.username}`);
    page.on("dialog", (d) => d.accept()); // the confirm() and the "User blocked." alert
    await page.getByRole("button", { name: "Block" }).click();
    // Once blocked, they can no longer send this person a friend request (403).
    await expect.poll(async () => (await other.request.post(`/api/friends/request/${me.username}`)).status()).toBe(403);
    await other.context.close();
  });
});

test.describe("groups", () => {
  test("create a group, and another person can join and leave it", async ({ page, browser, baseURL }) => {
    await signUpViaUi(page, newUser("founder"));
    const groupName = `Painters ${Date.now()}`;
    await page.goto("/groups");
    await page.getByRole("button", { name: "+ New group" }).click();
    await page.getByPlaceholder("Group name").fill(groupName);
    await page.getByPlaceholder("What's this group about?").fill("We paint together");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("link", { name: groupName })).toBeVisible();
    await expect(page.locator("div", { hasText: groupName }).getByText("1 members").first()).toBeVisible();

    const other = await secondBrowserUser(browser, baseURL!, "joiner");
    await other.page.goto("/groups");
    await other.page.getByPlaceholder("Search groups…").fill(groupName);
    await other.page.getByRole("button", { name: "Search", exact: true }).click();
    await other.page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(other.page.getByRole("button", { name: "Leave" })).toBeVisible();

    await other.page.getByRole("link", { name: groupName }).click();
    await expect(other.page.getByRole("heading", { name: groupName })).toBeVisible();
    await expect(other.page.getByText("2 members")).toBeVisible();
    await expect(other.page.getByText("Admin")).toBeVisible(); // the founder

    await other.page.getByRole("button", { name: "Leave group" }).click();
    await expect(other.page.getByRole("button", { name: "Join group" })).toBeVisible();
    await other.context.close();
  });

  test("someone else can see a private profile only after becoming friends", async ({ page, browser, baseURL }) => {
    const me = newUser("guarded");
    await signUpViaUi(page, me);
    await page.request.patch("/api/profiles/me", { data: { isPrivate: true } });

    const friend = await secondBrowserUser(browser, baseURL!, "invited");
    await friend.page.goto(`/u/${me.username}`);
    await expect(friend.page.getByText("This profile is unavailable or private.")).toBeVisible();

    await befriend(page.context().request, friend.context.request, me.username);
    await friend.page.reload();
    await expect(friend.page.getByRole("heading", { name: me.displayName })).toBeVisible();
    await friend.context.close();
  });
});
