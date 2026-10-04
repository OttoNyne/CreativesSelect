import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BlogEntryPage } from "./BlogEntryPage";
import { blogApi } from "../api/blog.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import type { BlogEntry, User } from "../types";

vi.mock("../api/blog.api", () => ({ blogApi: { get: vi.fn(), remove: vi.fn() } }));
vi.mock("../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
const api = vi.mocked(blogApi);

const ada = { id: "u1", username: "ada", displayName: "Ada" } as User;
const entry = (over: Partial<BlogEntry> = {}): BlogEntry => ({
  id: "e1",
  title: "A day in the studio",
  body: "First paragraph.\n\nSecond <b>paragraph</b>\nwith a line break.",
  createdAt: "2026-10-04T12:00:00.000Z",
  updatedAt: "2026-10-04T12:00:00.000Z",
  isAuthor: false,
  author: ada,
  ...over,
});

function renderAt(path = "/blog/e1") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog/:id" element={<BlogEntryPage />} />
        <Route path="/u/:username" element={<div>profile page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  [api.get, api.remove, vi.mocked(moderationApi.report)].forEach((fn) => fn.mockReset());
  vi.restoreAllMocks();
});

describe("BlogEntryPage", () => {
  it("shows the entry: title, author, date, and paragraphs as plain text", async () => {
    api.get.mockResolvedValue({ entry: entry() });
    renderAt();
    expect(await screen.findByRole("heading", { level: 1, name: "A day in the studio" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("e1");
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByText("October 4, 2026")).toBeInTheDocument();
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    // markup in the text is shown as typed, never rendered
    expect(screen.getByText(/Second <b>paragraph<\/b>/)).toBeInTheDocument();
    expect(document.querySelector("article b")).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Ada's profile/ })).toHaveAttribute("href", "/u/ada#blog");
    expect(screen.queryByText("(edited)")).not.toBeInTheDocument();
  });

  it("says when an entry has been edited", async () => {
    api.get.mockResolvedValue({ entry: entry({ updatedAt: "2026-10-05T12:00:00.000Z" }) });
    renderAt();
    expect(await screen.findByText("(edited)")).toBeInTheDocument();
  });

  it("lets a reader report it, and offers them no editing", async () => {
    api.get.mockResolvedValue({ entry: entry() });
    vi.mocked(moderationApi.report).mockResolvedValue({ report: {} });
    vi.spyOn(window, "prompt").mockReturnValue("spam");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderAt();
    expect(screen.queryByRole("link", { name: "Edit entry" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("blogEntry", "e1", "spam");
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("Report submitted"));
  });

  it("doesn't report when no reason is given", async () => {
    api.get.mockResolvedValue({ entry: entry() });
    vi.spyOn(window, "prompt").mockReturnValue("");
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Report" }));
    expect(moderationApi.report).not.toHaveBeenCalled();
  });

  it("lets the author edit or delete it, after asking, and goes back to their blog", async () => {
    api.get.mockResolvedValue({ entry: entry({ isAuthor: true }) });
    api.remove.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt();
    expect(await screen.findByRole("link", { name: "Edit entry" })).toHaveAttribute("href", "/blog/e1/edit");
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    expect(api.remove).not.toHaveBeenCalled(); // changed their mind
    await userEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("e1"));
    expect(await screen.findByText("profile page")).toBeInTheDocument();
  });

  it("says so if the entry can't be deleted", async () => {
    api.get.mockResolvedValue({ entry: entry({ isAuthor: true }) });
    api.remove.mockRejectedValue(new ApiError(500, "boom"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Delete entry" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("boom"));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("answers the same way for a missing entry and one from someone you can't see", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Entry not found"));
    renderAt();
    expect(await screen.findByRole("alert")).toHaveTextContent("This entry isn't available");
    expect(screen.getByRole("link", { name: "← Back to your feed" })).toHaveAttribute("href", "/");
  });

  it("says so when it can't be loaded for another reason", async () => {
    api.get.mockRejectedValue(new ApiError(500, "boom"));
    renderAt();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this entry");
  });
});
