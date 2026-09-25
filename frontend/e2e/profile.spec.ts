import { expect, test } from "@playwright/test";
import { apiUser, befriend, fakeIpHeaders, logInViaUi, logOut, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

test.describe("editing your profile", () => {
  test("changing your display name and username moves you to the new address and the profile still loads", async ({ page }) => {
    const user = newUser("painter");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();

    await page.locator("#display-name").fill("Painter Renamed");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Display name updated ✓")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Painter Renamed" })).toBeVisible();

    const newName = `${user.username}_new`.slice(0, 30);
    await page.locator("#username").fill(newName);
    await page.getByRole("button", { name: "Change username" }).click();

    // Regression: after a rename the page used to show "unavailable" (a late answer from the old address).
    await expect(page).toHaveURL(new RegExp(`/u/${newName}$`));
    await expect(page.getByRole("heading", { name: "Painter Renamed" })).toBeVisible();
    await expect(page.getByText(/unavailable or private/)).toHaveCount(0);
    await page.waitForTimeout(1500); // give any stale request time to (wrongly) land
    await expect(page.getByRole("heading", { name: "Painter Renamed" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Painter Renamed" })).toBeVisible();

    // The old address is gone; the session still works.
    await page.goto(`/u/${user.username}`);
    await expect(page.getByText("This profile is unavailable or private.")).toBeVisible();
    await page.goto("/help-wanted");
    await expect(page).toHaveURL(/\/help-wanted$/);
  });

  test("username rules are explained and enforced", async ({ page }) => {
    const user = newUser("rules");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();

    await expect(page.getByText(/reserved for you for 30 days/)).toBeVisible();
    await page.locator("#username").fill("has space!");
    await page.getByRole("button", { name: "Change username" }).click();
    await expect(page.getByText(/^Username must be 3–30 letters, numbers or underscores/)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/u/${user.username}$`));
  });

  test("a username someone else has is refused with a clear message", async ({ page, browser, baseURL }) => {
    const other = await apiUser(browser, baseURL!, "owner");
    const user = newUser("wanter");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.locator("#username").fill(other.user.username);
    await page.getByRole("button", { name: "Change username" }).click();
    await expect(page.getByText("That username is already taken")).toBeVisible();
    await other.context.close();
  });

  test("bio and privacy are saved", async ({ page }) => {
    const user = newUser("bio");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByPlaceholder("Tell people what you make…").fill("Ceramics and slow mornings");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("button", { name: "Done editing" }).click();
    await expect(page.getByText("Ceramics and slow mornings")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Ceramics and slow mornings")).toBeVisible();
  });

  test("a private profile is hidden from strangers", async ({ page, browser, baseURL }) => {
    const user = newUser("hidden");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    // The checkbox mirrors the server: it ticks once the change has been saved.
    await page.getByLabel("Private profile").click();
    await expect(page.getByLabel("Private profile")).toBeChecked();

    const stranger = await apiUser(browser, baseURL!, "stranger");
    const seen = await stranger.request.get(`/api/profiles/${user.username}`);
    expect(seen.status()).toBe(403);
    await stranger.context.close();
  });
});

test.describe("top friends", () => {
  test("picking top friends saves without an error (regression: 'Couldn't save your top friends')", async ({ page, browser, baseURL }) => {
    const user = newUser("topper");
    await signUpViaUi(page, user);
    const friend = await apiUser(browser, baseURL!, "bestie");
    await befriend(page.context().request, friend.request, user.username);

    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await page.goto(`/u/${user.username}`);
    const box = page.getByRole("heading", { name: "Top Friends" }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await box.getByRole("button", { name: "Edit" }).click();
    await box.getByRole("button", { name: new RegExp(friend.user.displayName) }).click();
    await box.getByRole("button", { name: "Save", exact: true }).click();

    await expect(box.getByRole("link", { name: new RegExp(friend.user.displayName) })).toBeVisible();
    await expect(box.getByRole("button", { name: "Edit" })).toBeVisible(); // left edit mode
    expect(dialogs, "an error dialog appeared").toEqual([]);

    await page.reload();
    await expect(page.getByRole("link", { name: new RegExp(friend.user.displayName) }).first()).toBeVisible();
    await friend.context.close();
  });
});

test.describe("account security", () => {
  test("changing your password: the new one works, the old one doesn't", async ({ page }) => {
    const user = newUser("pw");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: "Change password…" }).click();
    await page.getByPlaceholder("Current password").fill(user.password);
    await page.getByPlaceholder(/New password/).fill("Brand-new-pass-2");
    await page.getByPlaceholder("Confirm new password").fill("Brand-new-pass-2");
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.getByText("Password changed ✓")).toBeVisible();

    await logOut(page);
    await logInViaUi(page, { email: user.email, password: user.password });
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await logInViaUi(page, { email: user.email, password: "Brand-new-pass-2" });
    await expect(page).toHaveURL("/");
  });

  test("a wrong current password is refused", async ({ page }) => {
    const user = newUser("pw2");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: "Change password…" }).click();
    await page.getByPlaceholder("Current password").fill("not-my-password");
    await page.getByPlaceholder(/New password/).fill("Brand-new-pass-2");
    await page.getByPlaceholder("Confirm new password").fill("Brand-new-pass-2");
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.getByText("Current password is incorrect")).toBeVisible();
  });

  test("deleting your account signs you out and the account is gone", async ({ page }) => {
    const user = newUser("bye");
    await signUpViaUi(page, user);
    await page.goto(`/u/${user.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("button", { name: /Delete my account/ }).click();

    await page.getByPlaceholder(/Enter your password/).fill("wrong-password-1");
    await page.getByRole("button", { name: "Permanently delete account" }).click();
    await expect(page.getByText("Incorrect password")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/u/${user.username}$`)); // still here

    await page.getByPlaceholder(/Enter your password/).fill(user.password);
    await page.getByRole("button", { name: "Permanently delete account" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await logInViaUi(page, user);
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await page.goto(`/u/${user.username}`);
    // Signed out: the profile page redirects or reports it as unavailable — either way it's gone.
    await expect(page.getByRole("heading", { name: user.displayName })).toHaveCount(0);
  });
});
