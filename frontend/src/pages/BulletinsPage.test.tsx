import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { BulletinsPage } from "./BulletinsPage";
import { bulletinsApi } from "../api/bulletins.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import type { Bulletin, User } from "../types";

vi.mock("../api/bulletins.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/bulletins.api")>()),
  bulletinsApi: { list: vi.fn(), markSeen: vi.fn(), create: vi.fn(), remove: vi.fn(), unreadCount: vi.fn() },
}));
vi.mock("../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
const api = vi.mocked(bulletinsApi);

const ada = { id: "u1", username: "ada", displayName: "Ada" } as User;
const me = { id: "me", username: "me", displayName: "Me" } as User;
const bulletin = (over: Partial<Bulletin> = {}): Bulletin => ({
  id: "b1",
  title: "Show on Friday",
  body: "Come along!\n\nDoors at 7 <b>sharp</b>.",
  createdAt: "2026-10-04T12:00:00.000Z",
  expiresAt: new Date(Date.now() + 5.4 * 86_400_000).toISOString(),
  isMine: false,
  author: ada,
  ...over,
});

function renderIt() {
  render(
    <MemoryRouter>
      <BulletinsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(moderationApi.report).mockReset();
  vi.restoreAllMocks();
  api.markSeen.mockResolvedValue(undefined);
});

describe("BulletinsPage", () => {
  it("shows friends' bulletins with who, when and how long is left, as plain text, and marks them seen", async () => {
    api.list.mockResolvedValue({ bulletins: [bulletin()] });
    const changed = vi.fn();
    window.addEventListener("bulletins:changed", changed);
    renderIt();
    expect(await screen.findByRole("heading", { level: 2, name: "Show on Friday" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByText("October 4, 2026")).toBeInTheDocument();
    expect(screen.getByText("5 days left")).toBeInTheDocument();
    expect(screen.getByText(/Doors at 7 <b>sharp<\/b>\./)).toBeInTheDocument();
    expect(document.querySelector("article b")).toBeNull();
    await waitFor(() => expect(api.markSeen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    window.removeEventListener("bulletins:changed", changed);
  });

  it("says when the board is empty", async () => {
    api.list.mockResolvedValue({ bulletins: [] });
    renderIt();
    expect(await screen.findByText(/No bulletins yet/)).toBeInTheDocument();
  });

  it("says so when the board can't be loaded, and doesn't mark anything seen", async () => {
    api.list.mockRejectedValue(new ApiError(500, "boom"));
    renderIt();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the bulletins");
    expect(api.markSeen).not.toHaveBeenCalled();
  });

  it("keeps working if marking the board seen fails", async () => {
    api.list.mockResolvedValue({ bulletins: [bulletin()] });
    api.markSeen.mockRejectedValue(new ApiError(500, "boom"));
    renderIt();
    expect(await screen.findByText("Show on Friday")).toBeInTheDocument();
  });

  it("posts a bulletin to the top of the board and clears the form", async () => {
    api.list.mockResolvedValue({ bulletins: [bulletin()] });
    api.create.mockResolvedValue({ bulletin: bulletin({ id: "b2", title: "My news", body: "Hello", isMine: true, author: me }) });
    renderIt();
    await screen.findByText("Show on Friday");
    await userEvent.type(screen.getByLabelText("Bulletin title"), "My news");
    await userEvent.type(screen.getByLabelText("Bulletin text"), "Hello");
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Post bulletin" }));
    expect(api.create).toHaveBeenCalledWith({ title: "My news", body: "Hello" });
    const items = await screen.findAllByRole("heading", { level: 2 });
    expect(items.map((h) => h.textContent)).toEqual(["My news", "Show on Friday"]);
    expect(screen.getByLabelText("Bulletin title")).toHaveValue("");
    expect(screen.getByRole("link", { name: "You" })).toBeInTheDocument();
  });

  it("asks for a title and some text before sending anything", async () => {
    api.list.mockResolvedValue({ bulletins: [] });
    renderIt();
    await screen.findByText(/No bulletins yet/);
    await userEvent.click(screen.getByRole("button", { name: "Post bulletin" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give your bulletin a title");
    await userEvent.type(screen.getByLabelText("Bulletin title"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Post bulletin" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write something in your bulletin");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("shows the server's reason when a bulletin can't be posted, and keeps what was typed", async () => {
    api.list.mockResolvedValue({ bulletins: [] });
    api.create.mockRejectedValue(new ApiError(429, "You've posted a lot of bulletins today — try again tomorrow."));
    renderIt();
    await screen.findByText(/No bulletins yet/);
    await userEvent.type(screen.getByLabelText("Bulletin title"), "Hi");
    await userEvent.type(screen.getByLabelText("Bulletin text"), "There");
    await userEvent.click(screen.getByRole("button", { name: "Post bulletin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try again tomorrow");
    expect(screen.getByLabelText("Bulletin text")).toHaveValue("There");
  });

  it("lets people take down their own, after asking, and report other people's", async () => {
    api.list.mockResolvedValue({ bulletins: [bulletin({ id: "mine", title: "Mine", isMine: true, author: me }), bulletin()] });
    api.remove.mockResolvedValue(undefined);
    vi.mocked(moderationApi.report).mockResolvedValue({ report: {} });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.spyOn(window, "prompt").mockReturnValue("spam");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderIt();
    await screen.findByText("Mine");
    expect(screen.queryByRole("button", { name: "Report Mine" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take down Show on Friday" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Take down Mine" }));
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Take down Mine" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("mine"));
    await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Report Show on Friday" }));
    expect(moderationApi.report).toHaveBeenCalledWith("bulletin", "b1", "spam");
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("Report submitted"));
  });

  it("says so, and keeps the bulletin, when it can't be taken down", async () => {
    api.list.mockResolvedValue({ bulletins: [bulletin({ isMine: true, author: me })] });
    api.remove.mockRejectedValue(new ApiError(500, "boom"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Take down Show on Friday" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("boom"));
    expect(screen.getByText("Show on Friday")).toBeInTheDocument();
  });
});
