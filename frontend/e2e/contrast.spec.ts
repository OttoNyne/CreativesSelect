import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// Sign-up is limited per client address (10 an hour) and these tests register several people each, so every test arrives from its own.
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

// Axe measures the real, rendered colours (including translucent ones and the page behind them), so this checks what a
// visitor actually sees rather than what the class names say.
async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`),
  );
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

// A 1×1 picture, enough to give the portfolio something to show.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const THEMES = [
  { name: "the default dark theme", theme: {} },
  { name: "a white background", theme: { bgColor: "#ffffff", textColor: "#111111", accentColor: "#6d28d9" } },
  { name: "a cream background with light text picked (too faint to read)", theme: { bgColor: "#f4efe3", textColor: "#fafafa", accentColor: "#f4efe3" } },
  { name: "a pale yellow accent on a light background", theme: { bgColor: "#fdf6e3", textColor: "#222222", accentColor: "#ffe14d" } },
  { name: "a black background with dark text picked", theme: { bgColor: "#000000", textColor: "#222222", accentColor: "#111111" } },
  { name: "a bright yellow background", theme: { bgColor: "#ffd60a", textColor: "#ffd60a", accentColor: "#ff3b30" } },
  { name: "a mid-grey background", theme: { bgColor: "#808080", textColor: "#808080", accentColor: "#808080" } },
  { name: "a saturated blue background", theme: { bgColor: "#0047ab", textColor: "#0047ab", accentColor: "#ffffff" } },
];

test.describe("text can be read on light and dark backgrounds", () => {
  test("the public pages", async ({ page }) => {
    for (const path of ["/login", "/register", "/forgot-password", "/about", "/features", "/how-it-works"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      await page.waitForTimeout(400); // let the page fill in
      await expectReadable(page, path);
    }
  });

  test("the signed-in pages", async ({ page, browser, baseURL }) => {
    const me = newUser("reader");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "writer");
    await befriend(page.request, friend.request, me.username);
    const post = await (await page.request.post("/api/posts", { data: { content: "A post to read" } })).json();
    await friend.request.post(`/api/posts/${post.post.id}/comments`, { data: { content: "A comment to read" } });
    await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "A message to read" } });
    await page.request.post("/api/tasks", { data: { title: "Find a painter", description: "For a mural", isPublic: true } });

    for (const path of ["/", "/friends", "/messages", `/messages/${friend.user.username}`, "/groups", "/live", "/search", "/help-wanted", `/posts/${post.post.id}`]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      await page.waitForTimeout(400); // let the page fill in
      await expectReadable(page, path);
    }
    // the notification list, open
    await page.goto("/");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expectReadable(page, "the notification list");
    await friend.context.close();
  });

  test("messages and notices: errors, group chat, search, friend requests, the picture adjuster", async ({ page, browser, baseURL }) => {
    // an error message on a form
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill("nobody@example.com");
    await page.getByPlaceholder("Password").fill("not the password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expectReadable(page, "a login error");

    const me = newUser("busy");
    await signUpViaUi(page, me);
    const other = await apiUser(browser, baseURL!, "asker");
    expect((await other.request.post(`/api/friends/request/${me.username}`)).status()).toBe(201);
    await page.goto("/friends");
    await expect(page.getByText(other.user.displayName).first()).toBeVisible();
    await expectReadable(page, "the friends page with a request waiting");

    await page.goto("/search");
    await page.getByPlaceholder("Search creatives…").fill(other.user.username);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(other.user.displayName).first()).toBeVisible();
    await expectReadable(page, "search results");

    const created = await page.request.post("/api/groups", { data: { name: `Readable ${me.username}`, description: "a group" } });
    const groupId = (await created.json()).group.id as string;
    await other.request.post(`/api/groups/${groupId}/join`);
    await other.request.post(`/api/groups/${groupId}/messages`, { data: { body: "Hello from the group" } });
    await page.goto(`/groups/${groupId}`);
    await expect(page.getByText("Hello from the group")).toBeVisible();
    await expectReadable(page, "a group chat");

    await page.goto("/");
    await page.getByPlaceholder(/Share what you're working on/).fill("harbor at dusk");
    await page.getByRole("button", { name: /Generate image with AI/ }).click();
    await expect(page.getByLabel("Zoom", { exact: true })).toBeVisible();
    await expectReadable(page, "the post composer with the picture adjuster");
    await other.context.close();
  });

  test("a visitor sees a themed profile with its Add Friend button", async ({ page, browser, baseURL }) => {
    const owner = await apiUser(browser, baseURL!, "themed");
    for (const theme of [{}, { bgColor: "#ffffff", textColor: "#111111", accentColor: "#ffe14d" }, { bgColor: "#808080", textColor: "#808080", accentColor: "#808080" }]) {
      expect((await owner.request.patch("/api/profiles/me", { data: { bio: "Hello", theme } })).status()).toBe(200);
      await signUpViaUi(page, newUser("guest"));
      await page.goto(`/u/${owner.user.username}`);
      await expect(page.getByRole("button", { name: "Add Friend" })).toBeVisible();
      await expectNoHorizontalOverflow(page); // the buttons stay on the screen, phone included
      await expectReadable(page, `a visitor's view of a profile (${JSON.stringify(theme)})`);
      await page.context().clearCookies();
    }
    await owner.context.close();
  });

  test("the editing tools warn when a text colour can't be read", async ({ page }) => {
    await signUpViaUi(page, newUser("editor"));
    await page.goto("/");
    const me = await (await page.request.get("/api/auth/me")).json();
    await page.goto(`/u/${me.user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.locator('input[type="color"]').nth(1).fill("#12121a"); // text colour = the background
    await expect(page.getByRole("status")).toContainText("too close to the background");
    await expectReadable(page, "the theme editor with its warning");
  });

  for (const { name, theme } of THEMES) {
    test(`a profile with ${name}`, async ({ page, browser, baseURL }) => {
      const me = newUser("owner");
      await signUpViaUi(page, me);
      expect((await page.request.patch("/api/profiles/me", { data: { bio: "Painter and potter.", theme } })).status()).toBe(200);
      const visitor = await apiUser(browser, baseURL!, "visitor");
      await befriend(page.request, visitor.request, me.username);
      await visitor.request.post(`/api/profiles/${me.username}/comments`, { data: { content: "Lovely work!" } });
      await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: "A caption to read" } });

      await page.goto(`/u/${me.username}`);
      await expect(page.getByText("Lovely work!")).toBeVisible({ timeout: 20_000 });
      await expectReadable(page, `the profile (${name})`);

      // the owner's editing tools sit on the same background
      await page.getByRole("button", { name: "Edit profile" }).click();
      await expectReadable(page, `the profile being edited (${name})`);

      // and what a friend sees
      await page.goto("/login");
      await visitor.context.close();
    });
  }
});
