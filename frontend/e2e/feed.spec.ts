import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

const composer = (page: import("@playwright/test").Page) => page.getByPlaceholder(/Share what you're working on/);

test.describe("the feed", () => {
  test("a new account sees the empty state, then posts and deletes a post", async ({ page }) => {
    await signUpViaUi(page, newUser("poster"));
    await expect(page.getByText(/No posts yet/)).toBeVisible();

    await composer(page).fill("My first piece of the day");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const post = page.locator("article", { hasText: "My first piece of the day" });
    await expect(post).toBeVisible();
    await expect(composer(page)).toHaveValue(""); // composer clears itself

    await page.reload(); // it was really saved
    await expect(post).toBeVisible();

    await post.getByRole("button", { name: "Delete" }).click();
    await expect(post).toHaveCount(0);
    await page.reload();
    await expect(page.locator("article", { hasText: "My first piece of the day" })).toHaveCount(0);
    await expect(page.getByText(/No posts yet/)).toBeVisible();
  });

  test("a post can't be empty", async ({ page }) => {
    await signUpViaUi(page, newUser("blank"));
    await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
    await composer(page).fill("   ");
    await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
  });

  test("AI-assisted text and image are labelled on the post", async ({ page }) => {
    await signUpViaUi(page, newUser("ai"));
    await composer(page).fill("sunset over the harbor");
    await page.getByRole("button", { name: /Generate with AI/ }).click();
    await expect(composer(page)).not.toHaveValue("sunset over the harbor"); // replaced by generated text
    const generated = await composer(page).inputValue();
    expect(generated.length).toBeGreaterThan(5);

    await page.getByRole("button", { name: /Generate image with AI/ }).click();
    await expect(page.locator("form img").first()).toBeVisible();

    await page.getByRole("button", { name: "Post", exact: true }).click();
    const post = page.locator("article", { hasText: generated.slice(0, 20) });
    await expect(post).toBeVisible();
    await expect(post.getByText(/AI-assisted text/)).toBeVisible();
    await expect(post.getByText(/AI-generated image/)).toBeVisible();
    await expect(post.locator("img").first()).toBeVisible();
  });

  test("comments can be added and the count updates", async ({ page }) => {
    await signUpViaUi(page, newUser("chatty"));
    await composer(page).fill("Thoughts on colour theory?");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const post = page.locator("article", { hasText: "Thoughts on colour theory?" });
    await expect(post).toBeVisible();

    await post.getByRole("button", { name: /0 comments/ }).click();
    await post.getByPlaceholder("Write a comment…").fill("Complementary colours, always.");
    await post.getByRole("button", { name: "Post" }).click();
    await expect(post.getByText("Complementary colours, always.")).toBeVisible();
    await expect(post.getByRole("button", { name: /1 comment$/ })).toBeVisible();

    await page.reload();
    await expect(post.getByRole("button", { name: /1 comment$/ })).toBeVisible();
  });
});
