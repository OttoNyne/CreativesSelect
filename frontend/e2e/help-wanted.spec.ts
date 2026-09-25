import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

test.describe("the Help wanted board", () => {
  test("post a request, get an offer with a note, accept it, and the helper is told", async ({ page, browser, baseURL }) => {
    const owner = newUser("asker");
    await signUpViaUi(page, owner);
    const title = `Need a logo ${Date.now()}`;

    await page.goto("/help-wanted");
    await page.getByPlaceholder("What do you need help with?").fill(title);
    await page.getByPlaceholder("Details (optional)").fill("Simple zine logo, black and white");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText("Public", { exact: true })).toBeVisible();

    // A private ("Only me") request never reaches the board.
    const secret = `Private note ${Date.now()}`;
    await page.getByPlaceholder("What do you need help with?").fill(secret);
    await page.getByLabel(/Only me/).check();
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(secret)).toBeVisible();

    const helper = await secondBrowserUser(browser, baseURL!, "helper");
    await helper.page.goto("/help-wanted");
    await expect(helper.page.getByText(title)).toBeVisible();
    await expect(helper.page.getByText(secret)).toHaveCount(0);
    await expect(helper.page.getByText(owner.displayName)).toBeVisible();

    // The board is shared, so pick out this test's own request card.
    const card = helper.page.getByText(title).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    await card.getByRole("button", { name: "Offer help" }).click();
    await card.getByPlaceholder(/Add a note/).fill("I do vector logos — happy to help");
    await card.getByRole("button", { name: "Send offer" }).click();
    await expect(card.getByRole("button", { name: /Offer sent/ })).toBeDisabled();

    // The owner sees it in their notifications and accepts.
    await page.reload();
    await page.getByRole("button", { name: "Notifications" }).locator("visible=true").click();
    await expect(page.getByText(/offered to help with/)).toBeVisible();
    await expect(page.getByText(/I do vector logos/)).toBeVisible();
    await page.getByRole("button", { name: "Accept offer" }).click();
    await expect(page.getByText("Accepted ✓")).toBeVisible();

    // The helper is told.
    await helper.page.reload();
    await helper.page.getByRole("button", { name: "Notifications" }).locator("visible=true").click();
    await expect(helper.page.getByText(/accepted your offer to help with/)).toBeVisible();
    await helper.context.close();
  });

  test("a request can be resolved, hidden and deleted", async ({ page }) => {
    await signUpViaUi(page, newUser("manager"));
    await page.goto("/help-wanted");
    const title = `Mix my EP ${Date.now()}`;
    await page.getByPlaceholder("What do you need help with?").fill(title);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const row = page.locator("div", { hasText: title }).last();
    await expect(row).toBeVisible();

    await page.getByRole("button", { name: "Make private" }).click();
    await expect(page.getByText("Only me").first()).toBeVisible();
    await page.getByRole("button", { name: "Mark resolved" }).click();
    await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });
});
