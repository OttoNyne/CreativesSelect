import { expect, test } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// the shared e2e database holds everyone from every project, so each run searches for a word of its own
const uniqWord = () => `zq${Math.random().toString(36).slice(2, 9)}`;

test.describe("search", () => {
  test("finds people, blog entries, groups, group topics and Help wanted, and a search can be gone back to", async ({ page, browser, baseURL }) => {
    const me = newUser("searcher");
    await signUpViaUi(page, me);
    const word = uniqWord();
    const other = await apiUser(browser, baseURL!, "finder");
    expect((await other.request.patch("/api/profiles/me", { data: { bio: `Making ${word} things` } })).status()).toBe(200);
    const entry = await other.request.post("/api/blog", { data: { title: `Notes about ${word}`, body: `A long day spent with ${word} and nothing else.` } });
    expect(entry.status()).toBe(201);
    const group = (await (await other.request.post("/api/groups", { data: { name: `Club ${word}`, description: "A place to talk" } })).json()).group;
    expect((await page.request.post(`/api/groups/${group.id}/join`)).status()).toBe(204);
    expect((await other.request.post(`/api/groups/${group.id}/topics`, { data: { title: `Topic ${word}`, body: "Anyone else?" } })).status()).toBe(201);
    expect((await other.request.post("/api/tasks", { data: { title: `Need ${word}`, description: "Please help", isPublic: true } })).status()).toBe(201);

    await page.goto("/search");
    await page.getByRole("textbox", { name: "Search" }).fill(word);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${word}`));

    const results = page.getByRole("region", { name: "Search results" });
    // people: found by what their profile says, with the word marked
    await expect(page.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");
    await expect(results.getByRole("link", { name: new RegExp(other.user.displayName) })).toBeVisible();
    await expect(results.locator("mark", { hasText: word })).toBeVisible();

    await page.getByRole("tab", { name: "Blog entries" }).click();
    await expect(page).toHaveURL(/type=blog/);
    const entryLink = results.getByRole("link", { name: /Notes about/ });
    await expect(entryLink).toBeVisible();
    await expect(results.getByText(/A long day spent with/)).toBeVisible();

    await page.getByRole("tab", { name: "Groups" }).click();
    await expect(results.getByRole("link", { name: /Club/ })).toHaveAttribute("href", `/groups/${group.id}`);
    await expect(results.getByText(/You are in this group/)).toBeVisible();

    await page.getByRole("tab", { name: "Group topics" }).click();
    await expect(results.getByRole("link", { name: /Topic/ })).toBeVisible();
    await expect(results.getByText(/in Club/)).toBeVisible();

    await page.getByRole("tab", { name: "Help wanted" }).click();
    await expect(results.getByRole("link", { name: /Need/ })).toHaveAttribute("href", "/help-wanted");

    // open an entry, then go back: the search (its kind and its question) is where it was left
    await page.getByRole("tab", { name: "Blog entries" }).click();
    await results.getByRole("link", { name: /Notes about/ }).click();
    await expect(page).toHaveURL(/\/blog\//);
    await expect(page.getByRole("heading", { name: new RegExp(`Notes about ${word}`) })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("tab", { name: "Blog entries" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("textbox", { name: "Search" })).toHaveValue(word);
    await expect(page.getByRole("region", { name: "Search results" }).getByRole("link", { name: /Notes about/ })).toBeVisible();

    await other.context.close();
  });

  test("favours friends in common, can keep to friends, filters by tag, and never finds a private profile by what it says", async ({ page, browser, baseURL }) => {
    const me = newUser("socialite");
    await signUpViaUi(page, me);
    const word = uniqWord();
    const connector = await apiUser(browser, baseURL!, "connector");
    const near = await apiUser(browser, baseURL!, "near");
    const far = await apiUser(browser, baseURL!, "far");
    const hidden = await apiUser(browser, baseURL!, "hidden");
    await befriend(page.request, connector.request, me.username); // me <-> connector
    await befriend(connector.request, near.request, connector.user.username); // connector <-> near
    expect((await near.request.patch("/api/profiles/me", { data: { bio: `Loves ${word}`, tags: [word] } })).status()).toBe(200);
    expect((await far.request.patch("/api/profiles/me", { data: { bio: `Also loves ${word}` } })).status()).toBe(200);
    expect((await hidden.request.patch("/api/profiles/me", { data: { bio: `Secretly loves ${word}`, isPrivate: true } })).status()).toBe(200);

    await page.goto(`/search?q=${word}`);
    const results = page.getByRole("region", { name: "Search results" });
    const nearCard = results.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(near.user.displayName) }) });
    await expect(nearCard.getByText("1 friend in common")).toBeVisible();
    await expect(results.getByRole("link", { name: new RegExp(far.user.displayName) })).toBeVisible();
    // the one with a friend in common comes first
    const names = await results.getByRole("listitem").locator("a").allTextContents();
    expect(names.findIndex((n) => n.includes(near.user.displayName))).toBeLessThan(names.findIndex((n) => n.includes(far.user.displayName)));
    // what a private profile says is never searched
    await expect(results.getByRole("link", { name: new RegExp(hidden.user.displayName) })).toHaveCount(0);

    await page.getByLabel("Show").selectOption("mutual");
    await expect(page).toHaveURL(/connection=mutual/);
    await expect(results.getByRole("link", { name: new RegExp(near.user.displayName) })).toBeVisible();
    await expect(results.getByRole("link", { name: new RegExp(far.user.displayName) })).toHaveCount(0);

    await page.getByLabel("Show").selectOption("friends");
    await expect(page.getByText("No creatives found.")).toBeVisible();

    await page.getByLabel("Show").selectOption("any");
    await nearCard.getByRole("button", { name: `Browse everyone tagged ${word}` }).click();
    await expect(page).toHaveURL(new RegExp(`tag=${word}`));
    await expect(results.getByRole("link", { name: new RegExp(near.user.displayName) })).toBeVisible();
    await expect(results.getByRole("link", { name: new RegExp(far.user.displayName) })).toHaveCount(0);
    await page.getByRole("button", { name: `Stop filtering by ${word}` }).click();
    await expect(results.getByRole("link", { name: new RegExp(far.user.displayName) })).toBeVisible();

    // a friend can find the private profile by what it says
    await befriend(hidden.request, page.request, hidden.user.username);
    await page.reload();
    await expect(results.getByRole("link", { name: new RegExp(hidden.user.displayName) })).toBeVisible();

    await Promise.all([connector, near, far, hidden].map((u) => u.context.close()));
  });

  test("says when nothing matches, and asks for at least two letters", async ({ page }) => {
    const me = newUser("quiet");
    await signUpViaUi(page, me);
    await page.goto(`/search?q=${uniqWord()}nomatch`);
    await expect(page.getByText("No creatives found.")).toBeVisible();
    await page.goto("/search?q=a");
    await expect(page.getByText("Type at least two letters")).toBeVisible();
  });
});
