import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, codeAt, expectNoHorizontalOverflow, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

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

  // the settings the owner opens: the list of where they're signed in, on a dark and on a white profile
  for (const bg of [{ name: "dark", theme: {} }, { name: "white", theme: { bgColor: "#ffffff", textColor: "#111111", accentColor: "#6d28d9" } }]) {
    test(`the list of where you're signed in is readable on a ${bg.name} profile`, async ({ page, browser, baseURL }) => {
      const me = newUser("devlist");
      await signUpViaUi(page, me);
      expect((await page.request.patch("/api/profiles/me", { data: { theme: bg.theme } })).status()).toBe(200);
      const phone = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
      expect((await phone.request.post("/api/auth/login", { data: { email: me.email, password: me.password } })).status()).toBe(200);
      await page.goto(`/u/${me.username}`);
      await page.getByRole("button", { name: "Edit profile" }).click();
      await page.getByRole("button", { name: /Where you.re signed in/ }).click();
      await expect(page.getByRole("region", { name: "Where you're signed in" }).getByRole("listitem")).toHaveCount(2);
      await expectReadable(page, `the list of devices on a ${bg.name} profile`);
      await page.getByRole("button", { name: "Sign out the other device" }).click();
      await expect(page.getByText("Signed out 1 other device.")).toBeVisible();
      await expectReadable(page, `the list of devices after signing one out (${bg.name})`);
      await phone.close();
    });
  }

  // two-step sign-in: the settings (key and picture, then the recovery codes), and the code step of logging in, on a dark and on a white profile
  for (const bg of [{ name: "dark", theme: {} }, { name: "white", theme: { bgColor: "#ffffff", textColor: "#111111", accentColor: "#6d28d9" } }]) {
    test(`two-step sign-in is readable on a ${bg.name} profile`, async ({ page }) => {
      const me = newUser("tworead");
      await signUpViaUi(page, me);
      expect((await page.request.patch("/api/profiles/me", { data: { theme: bg.theme } })).status()).toBe(200);
      await page.goto(`/u/${me.username}`);
      await page.getByRole("button", { name: "Edit profile" }).click();
      await page.getByRole("button", { name: /Two-step sign-in…/ }).click();
      await expectReadable(page, `two-step sign-in, off (${bg.name})`);
      await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
      await page.getByLabel("Your password").fill(me.password);
      await expect(page.getByRole("button", { name: "Continue" })).toHaveCSS("opacity", "1");
      await expectReadable(page, `two-step sign-in, asking for the password (${bg.name})`);
      await page.getByRole("button", { name: "Continue" }).click();
      const secret = ((await page.getByLabel("Setup key").textContent()) ?? "").replace(/s/g, "");
      await expectReadable(page, `two-step sign-in, the key and picture (${bg.name})`);
      await page.getByLabel("6-digit code").fill("000000");
      await page.getByRole("button", { name: "Turn on", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("That code didn't match");
      await expect(page.getByRole("button", { name: "Turn on", exact: true })).toHaveCSS("opacity", "1");
      await expectReadable(page, `two-step sign-in, a wrong code (${bg.name})`);
      await page.getByLabel("6-digit code").fill(codeAt(secret));
      await page.getByRole("button", { name: "Turn on", exact: true }).click();
      await expect(page.getByRole("list", { name: "Recovery codes" })).toBeVisible();
      await expectReadable(page, `two-step sign-in, the recovery codes (${bg.name})`);
      await page.getByLabel(/I've saved these codes/).check();
      await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCSS("opacity", "1");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.getByText("You have 8 recovery codes left.")).toBeVisible();
      await expectReadable(page, `two-step sign-in, on (${bg.name})`);
      await page.getByRole("button", { name: "Turn off" }).first().click();
      await expect(page.getByLabel("Code from your app")).toBeVisible();
      await expectReadable(page, `two-step sign-in, turning off (${bg.name})`);
    });
  }

  test("the code step of logging in is readable, with an error showing", async ({ page, browser, baseURL }) => {
    const me = newUser("twologin");
    await signUpViaUi(page, me);
    const setup = await (await page.request.post("/api/auth/2fa/setup", { data: { password: me.password } })).json();
    expect((await page.request.post("/api/auth/2fa/enable", { data: { code: codeAt(setup.secret) } })).status()).toBe(200);
    const other = await browser.newContext({ baseURL, extraHTTPHeaders: fakeIpHeaders() });
    const p = await other.newPage();
    await p.goto("/login");
    await p.getByPlaceholder("Email").fill(me.email);
    await p.getByPlaceholder("Password").fill(me.password);
    await p.getByRole("button", { name: "Log in" }).click();
    await expect(p.getByRole("heading", { name: "Two-step sign-in" })).toBeVisible();
    await expectReadable(p, "the code step of logging in");
    await p.getByLabel("Code from your app").fill("000000");
    await p.getByRole("button", { name: "Continue" }).click();
    await expect(p.getByRole("alert")).toBeVisible();
    await expectReadable(p, "the code step of logging in, after a wrong code");
    await other.close();
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
    await page.getByPlaceholder("Search people, writing, groups…").fill(other.user.username);
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

  test("the share window, on a dark page and on a light profile", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("button", { name: "Share this site" }).click();
    await expect(page.getByTestId("share-qr")).toBeVisible();
    await expectReadable(page, "the share window");

    const me = newUser("sharer");
    await signUpViaUi(page, me);
    expect((await page.request.patch("/api/profiles/me", { data: { theme: { bgColor: "#ffffff", textColor: "#111111" } } })).status()).toBe(200);
    await page.goto(`/u/${me.username}`);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByTestId("share-qr")).toBeVisible();
    await expectReadable(page, "the share window over a light profile");
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

  // the feed is drawn on the background chosen for the profile, so it has to stay readable on every one of them too
  for (const { name, theme } of THEMES) {
    test(`the feed with ${name}`, async ({ page, browser, baseURL }) => {
      const me = newUser("feeder");
      await signUpViaUi(page, me);
      expect((await page.request.patch("/api/profiles/me", { data: { theme } })).status()).toBe(200);
      const friend = await apiUser(browser, baseURL!, "poster");
      await befriend(page.request, friend.request, me.username);
      await friend.request.post("/api/posts", { data: { content: "A friend's post to read" } });
      await page.request.post("/api/posts", { data: { content: "My own post to read" } });
      await page.goto("/");
      await expect(page.getByText("A friend's post to read")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("My own post to read")).toBeVisible();
      await expectReadable(page, `the feed (${name})`);
      await friend.context.close();
    });
  }

  // the profile styles (boxes that are outlined, glass or flat) change what text sits on, so each has to stay readable on light, middling
  // and dark backgrounds, and over a wallpaper
  const STYLED = [
    { name: "a white background", theme: { bgColor: "#ffffff", textColor: "#111111", accentColor: "#6d28d9" } },
    { name: "a mid-grey background", theme: { bgColor: "#808080", textColor: "#808080", accentColor: "#808080" } },
    { name: "a dark background", theme: { bgColor: "#101018", textColor: "#f5f5f7", accentColor: "#8b5cf6" } },
    { name: "a wallpaper", theme: { bgColor: "#ffffff", textColor: "#111111", accentColor: "#6d28d9" }, wallpaper: true },
  ];
  for (const cardStyle of ["outline", "glass", "flat"]) {
    for (const bg of STYLED) {
      test(`a profile with ${cardStyle} boxes on ${bg.name}`, async ({ page, browser, baseURL }) => {
        const me = newUser("styled");
        await signUpViaUi(page, me);
        const data = { bio: "Painter and potter.", theme: { ...bg.theme, cardStyle, corners: "square", headings: "serif", density: "roomy" }, ...(bg.wallpaper ? { wallpaperUrl: PIXEL, wallpaperType: "image" } : {}) };
        expect((await page.request.patch("/api/profiles/me", { data })).status()).toBe(200);
        const visitor = await apiUser(browser, baseURL!, "visitor");
        await befriend(page.request, visitor.request, me.username);
        await visitor.request.post(`/api/profiles/${me.username}/comments`, { data: { content: "Lovely work!" } });
        await page.request.post("/api/media", { data: { type: "image", url: PIXEL, caption: "A caption to read" } });
        await page.goto(`/u/${me.username}`);
        await expect(page.getByText("Lovely work!")).toBeVisible({ timeout: 20_000 });
        await expectReadable(page, `the profile (${cardStyle} boxes on ${bg.name})`);
        await page.getByRole("button", { name: "Edit profile" }).click();
        await expectReadable(page, `the profile being edited (${cardStyle} boxes on ${bg.name})`);
        await visitor.context.close();
      });
    }
  }

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
