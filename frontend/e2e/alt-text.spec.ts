import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const unique = (label: string) => `${label} ${randomBytes(3).toString("hex")}`;

test.describe("describing pictures", () => {
  test("a picture made from words starts with those words as its description, which can be changed before posting", async ({ page }) => {
    await signUpViaUi(page, newUser("describer"));
    const words = unique("a harbor at dusk");
    await page.getByPlaceholder(/Share what you're working on/).fill(words);
    await page.getByRole("button", { name: /Generate image with AI/ }).click();
    const box = page.getByRole("textbox", { name: /Describe the picture/ });
    await expect(box).toHaveValue(words);
    await box.fill("Boats tied up in a harbor under an orange sky");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByRole("img", { name: "Boats tied up in a harbor under an orange sky" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Describe the picture/ })).toHaveCount(0); // the box is cleared after posting
  });

  test("the owner adds a description to a picture later, and it is what a screen reader says", async ({ page }) => {
    await signUpViaUi(page, newUser("late"));
    const words = unique("No description yet");
    expect((await page.request.post("/api/posts", { data: { content: words, imageUrl: "https://img.example.com/a.png" } })).status()).toBe(201);
    await page.goto("/");
    const card = page.getByRole("article").filter({ hasText: words });
    await card.getByRole("button", { name: "Describe picture" }).click();
    await card.getByRole("textbox", { name: "Picture description" }).fill("A sketch of a lighthouse");
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByRole("img", { name: "A sketch of a lighthouse" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Edit picture description" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("img", { name: "A sketch of a lighthouse" })).toBeVisible();
  });

  test("the server refuses a description that is too long, and says so", async ({ page }) => {
    await signUpViaUi(page, newUser("verbose"));
    const res = await page.request.post("/api/posts", { data: { content: "x", imageUrl: "https://img.example.com/a.png", imageAlt: "a".repeat(301) } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("A picture description can be up to 300 characters");
  });
});
