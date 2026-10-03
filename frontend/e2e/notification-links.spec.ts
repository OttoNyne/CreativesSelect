import { expect, test, type Page } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

// The bell refreshes on its own every 30 seconds; reloading shows what's new straight away.
async function openBell(page: Page) {
  await page.reload();
  await page.getByRole("button", { name: "Notifications" }).click();
}

test.describe("clicking a notification takes you to what it was about", () => {
  test("a comment on your post opens that post with the comment highlighted", async ({ page, browser, baseURL }) => {
    const me = newUser("author");
    await signUpViaUi(page, me);
    const post = await (await page.request.post("/api/posts", { data: { content: "My latest painting" } })).json();
    const fan = await apiUser(browser, baseURL!, "fan");
    const comment = await (await fan.request.post(`/api/posts/${post.post.id}/comments`, { data: { content: "Those colours!" } })).json();

    await openBell(page);
    await page.getByText(/commented on your post/).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${post.post.id}\\?comment=${comment.comment.id}$`));
    await expect(page.getByText("My latest painting")).toBeVisible();
    const highlighted = page.locator(`#comment-${comment.comment.id}`);
    await expect(highlighted).toContainText("Those colours!");
    await expect(highlighted).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
    await fan.context.close();
  });

  test("a message opens the conversation, and the notification is cleared", async ({ page, browser, baseURL }) => {
    const me = newUser("reader");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "writer");
    await befriend(page.request, friend.request, me.username);
    await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Are you free Friday?" } });
    await friend.request.post(`/api/messages/with/${me.username}`, { data: { body: "Studio at 3?" } });

    await openBell(page);
    await expect(page.getByText(/sent you 2 messages/)).toBeVisible();
    await page.getByText(/sent you 2 messages/).click();
    await expect(page).toHaveURL(new RegExp(`/messages/${friend.user.username}$`));
    await expect(page.locator("div.rounded-2xl", { hasText: "Studio at 3?" })).toBeVisible();

    // opening the conversation cleared it
    const unread = async () => ((await (await page.request.get("/api/notifications")).json()).notifications as { type: string; isRead: boolean }[]).filter((n) => n.type === "message" && !n.isRead).length;
    await expect.poll(unread).toBe(0);
    await friend.context.close();
  });

  test("an accepted friend request opens the new friend's profile", async ({ page, browser, baseURL }) => {
    const me = newUser("asker");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "accepter");
    expect((await page.request.post(`/api/friends/request/${friend.user.username}`)).status()).toBe(201);
    const pending = await (await friend.request.get("/api/friends/requests")).json();
    await friend.request.post(`/api/friends/accept/${pending.requests[0].id}`);

    await openBell(page);
    await page.getByText(/accepted your friend request/).click();
    await expect(page).toHaveURL(new RegExp(`/u/${friend.user.username}$`));
    await friend.context.close();
  });

  test("a testimonial on your profile opens your profile at the testimonials", async ({ page, browser, baseURL }) => {
    const me = newUser("host");
    await signUpViaUi(page, me);
    const friend = await apiUser(browser, baseURL!, "visitor");
    await befriend(page.request, friend.request, me.username);
    expect((await friend.request.post(`/api/profiles/${me.username}/comments`, { data: { content: "Great work!" } })).status()).toBe(201);

    await openBell(page);
    await page.getByText(/left a comment on your profile/).click();
    await expect(page).toHaveURL(new RegExp(`/u/${me.username}#testimonials$`));
    await expect(page.getByRole("heading", { name: "Testimonials" })).toBeInViewport();
    await expect(page.getByText("Great work!")).toBeVisible();
    await friend.context.close();
  });

  test("the explicit link works too, and a read notification still takes you there", async ({ page, browser, baseURL }) => {
    const me = newUser("linker");
    await signUpViaUi(page, me);
    const post = await (await page.request.post("/api/posts", { data: { content: "Another one" } })).json();
    const fan = await apiUser(browser, baseURL!, "commenter");
    await fan.request.post(`/api/posts/${post.post.id}/comments`, { data: { content: "Nice" } });

    await openBell(page);
    await page.getByRole("link", { name: "View post" }).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${post.post.id}`));

    await openBell(page); // now already read
    await page.getByText(/commented on your post/).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${post.post.id}`));
    await fan.context.close();
  });

  test("a post you can't see says so instead of showing it", async ({ page, browser, baseURL }) => {
    const owner = await apiUser(browser, baseURL!, "private");
    expect((await owner.request.patch("/api/profiles/me", { data: { isPrivate: true } })).status()).toBe(200);
    const post = await (await owner.request.post("/api/posts", { data: { content: "Friends only" } })).json();

    await signUpViaUi(page, newUser("stranger"));
    await page.goto(`/posts/${post.post.id}`);
    await expect(page.getByRole("alert")).toContainText("This post isn't available");
    await expect(page.getByText("Friends only")).toHaveCount(0);
    await owner.context.close();
  });
});
