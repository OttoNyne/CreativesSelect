import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiUser, expectNoHorizontalOverflow, fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

async function expectReadable(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ")}`));
  expect(problems, `unreadable text on ${where}`).toEqual([]);
}

test.describe("open to work and requests for work", () => {
  test("a person opens up, someone asks them for work, they accept with a note, and the asker sees the answer", async ({ page, browser, baseURL }) => {
    const maker = newUser("designer");
    await signUpViaUi(page, maker);
    const client = await secondBrowserUser(browser, baseURL!, "client");

    // before the maker says so, there is nothing to ask for
    await client.page.goto(`/u/${maker.username}`);
    await expect(client.page.getByRole("button", { name: "Request work" })).toHaveCount(0);

    // the maker opens up from their profile settings
    await page.goto(`/u/${maker.username}`);
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("checkbox", { name: "Open to work: let people send me requests" }).click(); // saved straight away
    await expect(page.getByRole("checkbox", { name: "Open to work: let people send me requests" })).toBeChecked();
    await page.getByRole("textbox", { name: /What do you offer/ }).fill("Logo design");
    await page.getByRole("textbox", { name: /What do you offer/ }).press("Enter");
    await page.getByRole("textbox", { name: "A short note for people who find you" }).fill("Booked until March");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("button", { name: "Done editing" }).click();
    await expect(page.getByText("Open to work", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "What they offer" })).toContainText("logo design");
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "an open-to-work profile");

    // the client finds them by searching only those open to work
    await client.page.goto("/search?q=designer&type=people");
    await client.page.getByRole("checkbox", { name: "Only people open to work" }).click();
    await expect(client.page).toHaveURL(/open=1/);
    await expect(client.page.getByRole("link", { name: new RegExp(maker.displayName) })).toBeVisible();

    // and asks
    await client.page.goto(`/u/${maker.username}`);
    await client.page.getByRole("button", { name: "Request work" }).click();
    await client.page.getByRole("textbox", { name: "Title of your request" }).fill("A logo for my bakery");
    await client.page.getByRole("textbox", { name: "Details of your request" }).fill("Warm colours, hand-drawn feel.");
    await client.page.getByRole("textbox", { name: "Budget" }).fill("around 200");
    await expectReadable(client.page, "the request form");
    await client.page.getByRole("button", { name: "Send request" }).click();
    await expect(client.page.getByRole("status")).toContainText("Request sent");

    // the maker is told, sees it on their profile, and accepts with a note
    await expect.poll(async () => (await (await page.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "work_request")).toBe(true);
    await page.goto(`/u/${maker.username}`);
    const requests = page.getByRole("region", { name: "Requests for work" });
    await expect(requests).toContainText("A logo for my bakery");
    await expect(requests).toContainText("Budget: around 200");
    await expectReadable(page, "the requests for work");
    await requests.getByRole("textbox", { name: "Your note to them" }).fill("Happy to, message me");
    await requests.getByRole("button", { name: "Accept" }).click();
    await expect(requests).toContainText("You accepted this");

    // the client is told, and sees the answer on their own profile
    await expect.poll(async () => (await (await client.context.request.get("/api/notifications")).json()).notifications.some((n: { type: string }) => n.type === "work_reply")).toBe(true);
    await client.page.goto(`/u/${client.user.username}`);
    const sent = client.page.getByRole("region", { name: "Requests for work" });
    await expect(sent).toContainText("They accepted — Happy to, message me");
    await client.context.close();
  });

  test("someone who hasn't opened up can't be asked, and it is said plainly", async ({ page, browser, baseURL }) => {
    const closed = await apiUser(browser, baseURL!, "closed");
    await signUpViaUi(page, newUser("asker"));
    const res = await page.request.post(`/api/work-requests/to/${closed.user.username}`, { data: { title: "A logo", details: "Please" } });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("That person isn't taking requests");
    await closed.context.close();
  });

  test("a request can be withdrawn while it waits", async ({ page, browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "maker");
    await maker.request.patch("/api/profiles/me", { data: { openToWork: true } });
    const me = newUser("asker2");
    await signUpViaUi(page, me);
    const made = await page.request.post(`/api/work-requests/to/${maker.user.username}`, { data: { title: "A poster", details: "A3, bold colours" } });
    expect(made.status()).toBe(201);
    await page.goto(`/u/${me.username}`);
    const region = page.getByRole("region", { name: "Requests for work" });
    await expect(region).toContainText("Waiting for an answer");
    await region.getByRole("button", { name: "Withdraw" }).click();
    await expect(region).toHaveCount(0);
    expect((await (await maker.request.get("/api/work-requests/received")).json()).requests).toEqual([]);
    await maker.context.close();
  });

  test("in Arabic the badge and the request form read right to left and fit the screen", async ({ page, browser, baseURL }) => {
    const maker = await apiUser(browser, baseURL!, "arabicmaker");
    await maker.request.patch("/api/profiles/me", { data: { openToWork: true, workOffers: ["تصميم"], workNote: "متاح من الأسبوع القادم" } });
    await signUpViaUi(page, newUser("arabicclient"));
    await page.evaluate(() => localStorage.setItem("cs-language", "ar"));
    await page.goto(`/u/${maker.user.username}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("متاح للعمل", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "طلب عمل" }).click();
    await expect(page.getByRole("form", { name: /اطلب عملًا من/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadable(page, "the Arabic request form");
    await maker.context.close();
  });
});
