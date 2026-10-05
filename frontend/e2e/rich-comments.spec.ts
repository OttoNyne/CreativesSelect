import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });

const composer = (page: import("@playwright/test").Page) => page.getByPlaceholder(/Share what you're working on/);

test.describe("richer comments", () => {
  test("a comment's web address becomes a safe link, and a look-alike address stays plain text", async ({ page }) => {
    await signUpViaUi(page, newUser("linker"));
    await composer(page).fill("Something to comment on");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const post = page.locator("article", { hasText: "Something to comment on" });
    await post.getByRole("button", { name: /0 comments/ }).click();
    await post.getByPlaceholder("Write a comment…").fill("My portfolio: https://example.com/work. Careful: https://paypal.com@evil.example.com/login");
    await post.getByRole("button", { name: "Post", exact: true }).click();

    const link = post.getByRole("link", { name: "example.com/work" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://example.com/work");
    await expect(link).toHaveAttribute("target", "_blank");
    expect(await link.getAttribute("rel")).toMatch(/noopener/);
    expect(await link.getAttribute("rel")).toMatch(/nofollow/);
    await expect(post.getByText(/paypal\.com@evil\.example\.com/)).toBeVisible();
    await expect(post.getByRole("link", { name: /paypal/ })).toHaveCount(0); // an address with a name in it is never made a link

    await page.reload();
    await post.getByRole("button", { name: /1 comment$/ }).click();
    await expect(post.getByRole("link", { name: "example.com/work" })).toBeVisible();
  });

  test("a testimonial can't hold more than three links", async ({ page }) => {
    const me = newUser("spammy");
    await signUpViaUi(page, me);
    await page.goto(`/u/${me.username}`);
    const box = page.getByPlaceholder("Leave a comment on this profile…");
    await box.fill("https://a.example.com https://b.example.com https://c.example.com https://d.example.com");
    await page.locator("#testimonials").getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(/up to 3 links/)).toBeVisible();
    await box.fill("https://a.example.com https://b.example.com https://c.example.com");
    await page.locator("#testimonials").getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.locator("#testimonials").getByRole("link", { name: "a.example.com" })).toBeVisible();
  });

  test("a picture has to be one uploaded here: any other address is refused, and the picture button is offered", async ({ page }) => {
    const me = newUser("pictures");
    await signUpViaUi(page, me);
    const post = await (await page.request.post("/api/posts", { data: { content: "A post" } })).json();
    for (const imageUrl of ["https://evil.example.com/pixel.gif", "http://tracker.example.com/x.png", "data:image/png;base64,AAAA"]) {
      const res = await page.request.post(`/api/posts/${post.post.id}/comments`, { data: { content: "hi", imageUrl } });
      expect(res.status(), imageUrl).toBe(400);
    }
    await page.reload();
    await page.locator("article", { hasText: "A post" }).getByRole("button", { name: /0 comments/ }).click();
    await expect(page.getByText("📎 Add a picture")).toBeVisible();
  });
});
