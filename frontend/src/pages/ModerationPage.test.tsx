import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ModerationPage } from "./ModerationPage";
import { adminApi } from "../api/admin.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { ModerationCase, SuspendedAccount, AdminAction, User } from "../types";

vi.mock("../api/admin.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/admin.api")>()),
  adminApi: { reports: vi.fn(), resolve: vi.fn(), actions: vi.fn(), suspended: vi.fn(), unsuspend: vi.fn() },
}));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(adminApi);

const author = { id: "u1", username: "pat", displayName: "Pat Author", avatarUrl: null } as User;
const reporter = { id: "u2", username: "rae", displayName: "Rae Reporter", avatarUrl: null } as User;
const postCase = (over: Partial<ModerationCase> = {}): ModerationCase => ({
  targetType: "post",
  targetId: "p1",
  exists: true,
  target: { type: "post", author, text: "A <b>rude</b> post\n\nsecond paragraph", link: "/posts/p1" },
  count: 1,
  reports: [{ id: "r1", reason: "this is abusive", createdAt: "2026-10-04T12:00:00.000Z", reporter }],
  ...over,
});

function renderPage(isAdmin = true) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "boss", displayName: "Boss", isAdmin } as User, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  return render(
    <MemoryRouter>
      <ModerationPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.restoreAllMocks();
  api.reports.mockResolvedValue({ cases: [postCase()], page: 1, hasMore: false });
  api.actions.mockResolvedValue({ actions: [], page: 1, hasMore: false });
  api.suspended.mockResolvedValue({ users: [], page: 1, hasMore: false });
});

describe("ModerationPage: who can see it", () => {
  it("tells anyone who isn't a moderator there is nothing here, without asking the server", () => {
    renderPage(false);
    expect(screen.getByRole("alert")).toHaveTextContent("There's nothing here.");
    expect(api.reports).not.toHaveBeenCalled();
  });

  it("shows the same to a moderator whose access has been taken away since the page loaded", async () => {
    api.reports.mockRejectedValue(new ApiError(404, "Not found"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("There's nothing here.");
  });
});

describe("ModerationPage: open reports", () => {
  it("shows what was reported, as plain text, with who wrote it, why it was reported and who reported it", async () => {
    renderPage();
    expect(await screen.findByText("Post")).toBeInTheDocument();
    expect(screen.getByText("1 report")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pat Author" })).toHaveAttribute("href", "/u/pat");
    expect(screen.getByText(/A <b>rude<\/b> post/)).toBeInTheDocument();
    expect(document.querySelector("li b")).toBeNull();
    expect(screen.getByText(/this is abusive/)).toBeInTheDocument();
    expect(screen.getByText(/Rae Reporter/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open it/ })).toHaveAttribute("href", "/posts/p1");
  });

  it("says when nothing is waiting", async () => {
    api.reports.mockResolvedValue({ cases: [], page: 1, hasMore: false });
    renderPage();
    expect(await screen.findByText(/Nothing waiting/)).toBeInTheDocument();
  });

  it("dismisses with the note, and the case leaves the list", async () => {
    api.resolve.mockResolvedValue({ outcome: "dismissed", removed: false });
    renderPage();
    await userEvent.type(await screen.findByLabelText(/Note for the record/), "looks fine to me");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(api.resolve).toHaveBeenCalledWith("post", "p1", "dismiss", "looks fine to me");
    await waitFor(() => expect(screen.queryByText(/this is abusive/)).not.toBeInTheDocument());
    expect(screen.getByText(/Nothing waiting/)).toBeInTheDocument();
  });

  it("sends no note when none was written", async () => {
    api.resolve.mockResolvedValue({ outcome: "dismissed", removed: false });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(api.resolve).toHaveBeenCalledWith("post", "p1", "dismiss", undefined);
  });

  it("asks before removing content or suspending, and does nothing if the moderator changes their mind", async () => {
    api.resolve.mockResolvedValue({ outcome: "removed", removed: true });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Remove content" }));
    expect(api.resolve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Remove content" }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("The author will be told"));
    expect(api.resolve).toHaveBeenCalledWith("post", "p1", "remove", undefined);
  });

  it("can suspend the author, or remove and suspend, each after asking", async () => {
    api.resolve.mockResolvedValue({ outcome: "suspended", removed: false });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Suspend author" }));
    expect(api.resolve).toHaveBeenLastCalledWith("post", "p1", "suspend", undefined);
  });

  it("offers 'remove and suspend' too", async () => {
    api.resolve.mockResolvedValue({ outcome: "removed_and_suspended", removed: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Remove and suspend" }));
    expect(api.resolve).toHaveBeenCalledWith("post", "p1", "remove_and_suspend", undefined);
  });

  it("offers only dismiss and suspend for an account report, never removal", async () => {
    api.reports.mockResolvedValue({ cases: [postCase({ targetType: "user", targetId: "u1", target: { type: "user", author, title: "Pat Author", text: "bio", link: "/u/pat" } })], page: 1, hasMore: false });
    renderPage();
    expect(await screen.findByRole("button", { name: "Suspend account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove content" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove and suspend" })).not.toBeInTheDocument();
  });

  it("shows something already deleted as gone, with only a way to dismiss", async () => {
    api.reports.mockResolvedValue({ cases: [postCase({ exists: false, target: null })], page: 1, hasMore: false });
    renderPage();
    expect(await screen.findByText("Already deleted")).toBeInTheDocument();
    expect(screen.getByText(/nothing left to review/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove content" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Suspend (author|account)$/ })).not.toBeInTheDocument();
  });

  it("says how many reports there are beyond the ones shown", async () => {
    api.reports.mockResolvedValue({ cases: [postCase({ count: 14 })], page: 1, hasMore: false });
    renderPage();
    expect(await screen.findByText("14 reports")).toBeInTheDocument();
    expect(screen.getByText("…and 13 more")).toBeInTheDocument();
  });

  it("keeps the case and shows the reason when a decision can't be saved", async () => {
    api.resolve.mockRejectedValue(new ApiError(400, "An administrator can't be suspended here"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Suspend author" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("administrator can't be suspended");
    expect(screen.getByText(/this is abusive/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
  });

  it("shows more cases, adding to the list", async () => {
    api.reports.mockResolvedValueOnce({ cases: [postCase()], page: 1, hasMore: true });
    api.reports.mockResolvedValueOnce({ cases: [postCase({ targetId: "p2", reports: [{ id: "r2", reason: "second one", createdAt: "2026-10-04T12:00:00.000Z", reporter }] })], page: 2, hasMore: false });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(api.reports).toHaveBeenLastCalledWith(2);
    expect(await screen.findByText(/second one/)).toBeInTheDocument();
    expect(screen.getByText(/this is abusive/)).toBeInTheDocument();
  });

  it("says so when the queue can't be loaded", async () => {
    api.reports.mockRejectedValue(new ApiError(500, "boom"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this.");
  });
});

describe("ModerationPage: the record and suspended accounts", () => {
  const action = (over: Partial<AdminAction> = {}): AdminAction => ({
    id: "a1",
    targetType: "post",
    targetId: "p1",
    action: "removed_and_suspended",
    note: "repeat offender",
    reportCount: 3,
    createdAt: "2026-10-04T12:00:00.000Z",
    admin: { id: "me", username: "boss", displayName: "Boss" } as User,
    subject: author,
    ...over,
  });

  it("lists past decisions with who decided, about whom, and the note", async () => {
    api.actions.mockResolvedValue({ actions: [action(), action({ id: "a2", action: "dismissed", note: "", reportCount: 1 })], page: 1, hasMore: false });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Handled" }));
    expect(await screen.findByText("Content removed, account suspended")).toBeInTheDocument();
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    expect(screen.getAllByText(/About Pat Author · by Boss · October 4, 2026/, { selector: "div" })).toHaveLength(2);
    expect(screen.getByText("Note: repeat offender")).toBeInTheDocument();
    expect(screen.getByText(/3 reports/)).toBeInTheDocument();
  });

  it("says when there are no decisions yet", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Handled" }));
    expect(await screen.findByText("No decisions yet.")).toBeInTheDocument();
  });

  it("lists suspended accounts with the note and lets a moderator lift a suspension, after asking", async () => {
    const account: SuspendedAccount = { user: author, suspendedAt: "2026-10-04T12:00:00.000Z", note: "spam" };
    api.suspended.mockResolvedValue({ users: [account], page: 1, hasMore: false });
    api.unsuspend.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Suspended accounts" }));
    const row = (await screen.findByText("@pat")).closest("li")!;
    expect(within(row).getByText(/Suspended October 4, 2026 · spam/)).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Lift suspension" }));
    expect(api.unsuspend).not.toHaveBeenCalled();
    await userEvent.click(within(row).getByRole("button", { name: "Lift suspension" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(api.unsuspend).toHaveBeenCalledWith("u1"));
    expect(await screen.findByText("No accounts are suspended.")).toBeInTheDocument();
  });

  it("says why a suspension couldn't be lifted", async () => {
    api.suspended.mockResolvedValue({ users: [{ user: author, suspendedAt: "2026-10-04T12:00:00.000Z", note: "" }], page: 1, hasMore: false });
    api.unsuspend.mockRejectedValue(new ApiError(404, "That account isn't suspended"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Suspended accounts" }));
    await userEvent.click(await screen.findByRole("button", { name: "Lift suspension" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("That account isn't suspended"));
  });
});
