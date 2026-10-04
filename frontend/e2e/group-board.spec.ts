import { expect, test } from "@playwright/test";
import { fakeIpHeaders, newUser, secondBrowserUser, signUpViaUi } from "./helpers";

test.use({ extraHTTPHeaders: fakeIpHeaders() });
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders(fakeIpHeaders());
});

const uniq = (title: string) => `${title} ${Math.random().toString(36).slice(2, 7)}`;
const board = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Board" });

test.describe("a group's board", () => {
  test("members start topics and reply, an admin pins and moderates, and authors can remove their own", async ({ page, browser, baseURL }) => {
    const admin = newUser("founder");
    await signUpViaUi(page, admin);
    const made = await page.request.post("/api/groups", { data: { name: uniq("Potters"), description: "Clay talk" } });
    expect(made.status()).toBe(201);
    const gid = (await made.json()).group.id as string;
    const member = await secondBrowserUser(browser, baseURL!, "member");
    expect((await member.context.request.post(`/api/groups/${gid}/join`)).status()).toBe(204);

    // the admin starts a topic from the group page
    const title = uniq("Kiln recommendations");
    await page.goto(`/groups/${gid}`);
    await expect(board(page)).toContainText("No topics yet");
    await board(page).getByRole("button", { name: "New topic" }).click();
    await page.getByLabel("Topic title").fill(title);
    await page.getByLabel("Topic text").fill("Which one do you use?\n\nBudget <b>is</b> tight.");
    await page.getByRole("button", { name: "Start topic" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Budget <b>is</b> tight.")).toBeVisible(); // shown as typed

    // the member sees it, replies, and can't pin or delete the admin's topic
    await member.page.goto(`/groups/${gid}`);
    await member.page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(member.page.getByRole("heading", { name: title })).toBeVisible();
    await expect(member.page.getByRole("button", { name: "Pin topic" })).toHaveCount(0);
    await expect(member.page.getByRole("button", { name: "Delete topic" })).toHaveCount(0);
    await member.page.getByLabel("Reply").fill("I use a small electric one");
    await member.page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(member.page.getByText("I use a small electric one")).toBeVisible();
    await expect(member.page.getByText("1 reply")).toBeVisible();

    // the admin sees the reply count, pins the topic, and it shows as pinned in the list
    await page.reload();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByText("I use a small electric one")).toBeVisible();
    await page.getByRole("button", { name: "Pin topic" }).click();
    await expect(page.getByRole("button", { name: "Unpin topic" })).toBeVisible();
    await page.getByRole("button", { name: "← Back to the board" }).click();
    await expect(page.getByRole("button", { name: new RegExp(title) })).toContainText("Pinned");
    await expect(page.getByRole("button", { name: new RegExp(title) })).toContainText("1 reply");

    // the member deletes their own reply; the admin could delete anyone's
    member.page.once("dialog", (d) => d.accept());
    await member.page.getByRole("button", { name: "Delete reply by you" }).click();
    await expect(member.page.getByText("I use a small electric one")).toHaveCount(0);

    // the admin deletes the topic: it is gone for the member as well
    await page.getByRole("button", { name: new RegExp(title) }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete topic" }).click();
    await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
    await member.page.reload();
    await expect(member.page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
    await member.context.close();
  });

  test("only members can read or write a board, and a topic needs a title and some text", async ({ page, browser, baseURL }) => {
    const admin = newUser("host");
    await signUpViaUi(page, admin);
    const gid = (await (await page.request.post("/api/groups", { data: { name: uniq("Closed") } })).json()).group.id as string;
    expect((await page.request.post(`/api/groups/${gid}/topics`, { data: { title: "Hello", body: "World" } })).status()).toBe(201);

    const outsider = await secondBrowserUser(browser, baseURL!, "outsider");
    expect((await outsider.context.request.get(`/api/groups/${gid}/topics`)).status()).toBe(403);
    expect((await outsider.context.request.post(`/api/groups/${gid}/topics`, { data: { title: "x", body: "y" } })).status()).toBe(403);
    await outsider.page.goto(`/groups/${gid}`);
    await expect(outsider.page.getByRole("button", { name: "Join group" })).toBeVisible();
    await expect(board(outsider.page)).toHaveCount(0);
    await outsider.context.close();

    await page.goto(`/groups/${gid}`);
    await board(page).getByRole("button", { name: "New topic" }).click();
    await page.getByRole("button", { name: "Start topic" }).click();
    await expect(page.getByRole("alert")).toContainText("Give your topic a title");
    await page.getByLabel("Topic title").fill("Only a title");
    await page.getByRole("button", { name: "Start topic" }).click();
    await expect(page.getByRole("alert")).toContainText("Write something to start the topic");
  });

  test("at most three topics can be pinned, and only an admin can pin", async ({ page, browser, baseURL }) => {
    const admin = newUser("curator");
    await signUpViaUi(page, admin);
    const gid = (await (await page.request.post("/api/groups", { data: { name: uniq("Pins") } })).json()).group.id as string;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await (await page.request.post(`/api/groups/${gid}/topics`, { data: { title: `Topic ${i}`, body: "x" } })).json()).topic.id);
    for (let i = 0; i < 3; i++) expect((await page.request.put(`/api/groups/${gid}/topics/${ids[i]}/pin`, { data: { pinned: true } })).status()).toBe(200);
    expect((await page.request.put(`/api/groups/${gid}/topics/${ids[3]}/pin`, { data: { pinned: true } })).status()).toBe(400);
    const member = await secondBrowserUser(browser, baseURL!, "regular");
    await member.context.request.post(`/api/groups/${gid}/join`);
    expect((await member.context.request.put(`/api/groups/${gid}/topics/${ids[3]}/pin`, { data: { pinned: true } })).status()).toBe(403);
    await member.context.close();
  });
});
