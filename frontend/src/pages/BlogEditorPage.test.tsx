import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BlogEditorPage } from "./BlogEditorPage";
import { blogApi } from "../api/blog.api";
import { ApiError } from "../api/client";
import type { BlogEntry, User } from "../types";

vi.mock("../api/blog.api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/blog.api")>()), blogApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "me", username: "me" }, isLoading: false, setUser: vi.fn(), refresh: vi.fn() }) }));
const api = vi.mocked(blogApi);

const saved = (over: Partial<BlogEntry> = {}): BlogEntry => ({
  id: "e1",
  title: "Old title",
  body: "Old text",
  createdAt: "2026-10-04T12:00:00.000Z",
  updatedAt: "2026-10-04T12:00:00.000Z",
  isAuthor: true,
  author: { id: "me", username: "me", displayName: "Me" } as User,
  ...over,
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog/new" element={<BlogEditorPage />} />
        <Route path="/blog/:id/edit" element={<BlogEditorPage />} />
        <Route path="/blog/:id" element={<div>entry page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("BlogEditorPage: a new entry", () => {
  it("publishes a title and text, then opens the entry", async () => {
    api.create.mockResolvedValue({ entry: saved({ id: "new1" }) });
    renderAt("/blog/new");
    await userEvent.type(screen.getByLabelText("Entry title"), "Hello");
    await userEvent.type(screen.getByLabelText("Entry text"), "First line");
    expect(screen.getByText("10 / 10,000")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(api.create).toHaveBeenCalledWith({ title: "Hello", body: "First line" });
    expect(await screen.findByText("entry page")).toBeInTheDocument();
  });

  it("asks for a title and some text before sending anything", async () => {
    renderAt("/blog/new");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give your entry a title");
    await userEvent.type(screen.getByLabelText("Entry title"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write something in your entry");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("shows the server's reason when it can't be saved, and lets them try again", async () => {
    api.create.mockRejectedValueOnce(new ApiError(429, "You've written a lot of entries — try again later."));
    api.create.mockResolvedValueOnce({ entry: saved() });
    renderAt("/blog/new");
    await userEvent.type(screen.getByLabelText("Entry title"), "Hello");
    await userEvent.type(screen.getByLabelText("Entry text"), "Text");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try again later");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("entry page")).toBeInTheDocument();
  });

  it("goes back to your blog when cancelled", () => {
    renderAt("/blog/new");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/u/me#blog");
  });
});

describe("BlogEditorPage: changing an entry", () => {
  it("fills in what was written, and saves the change", async () => {
    api.get.mockResolvedValue({ entry: saved() });
    api.update.mockResolvedValue({ entry: saved({ title: "New title" }) });
    renderAt("/blog/e1/edit");
    const title = await screen.findByLabelText("Entry title");
    expect(title).toHaveValue("Old title");
    expect(screen.getByLabelText("Entry text")).toHaveValue("Old text");
    await userEvent.clear(title);
    await userEvent.type(title, "New title");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("e1", { title: "New title", body: "Old text" }));
    expect(await screen.findByText("entry page")).toBeInTheDocument();
  });

  it("won't open someone else's entry for changing, or one that isn't there", async () => {
    api.get.mockResolvedValue({ entry: saved({ isAuthor: false }) });
    renderAt("/blog/e1/edit");
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't available to change");
    expect(screen.queryByLabelText("Entry title")).not.toBeInTheDocument();
  });

  it("says the same when the entry can't be loaded", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Entry not found"));
    renderAt("/blog/e1/edit");
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't available to change");
  });
});
