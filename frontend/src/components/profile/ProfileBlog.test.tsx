import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProfileBlog } from "./ProfileBlog";
import { blogApi } from "../../api/blog.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

vi.mock("../../api/blog.api", () => ({ blogApi: { byUser: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const byUser = vi.mocked(blogApi.byUser);

const entry = (n: number) => ({ id: `e${n}`, title: `Entry ${n}`, excerpt: `Excerpt ${n}`, createdAt: "2026-10-04T12:00:00.000Z", updatedAt: "2026-10-04T12:00:00.000Z" });

function renderIt(isOwner = false, signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? ({ id: "me", username: "me" } as never) : null, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter>
      <ProfileBlog username="zoe" isOwner={isOwner} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  byUser.mockReset();
});

describe("ProfileBlog", () => {
  it("lists entries with their date and the start of the text, each linking to the entry", async () => {
    byUser.mockResolvedValue({ entries: [entry(2), entry(1)], page: 1, hasMore: false });
    renderIt();
    const link = await screen.findByRole("link", { name: /Entry 2/ });
    expect(link).toHaveAttribute("href", "/blog/e2");
    expect(link).toHaveTextContent("Excerpt 2");
    expect(link).toHaveTextContent("October 4, 2026");
    expect(byUser).toHaveBeenCalledWith("zoe");
    expect(screen.queryByRole("link", { name: "Write an entry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more entries" })).not.toBeInTheDocument();
  });

  it("shows nothing at all, to a visitor, when someone has written nothing", async () => {
    byUser.mockResolvedValue({ entries: [], page: 1, hasMore: false });
    renderIt();
    await vi.waitFor(() => expect(byUser).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Blog" })).not.toBeInTheDocument();
  });

  it("doesn't even ask for entries when nobody is signed in", () => {
    renderIt(false, false);
    expect(byUser).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Blog" })).not.toBeInTheDocument();
  });

  it("offers the owner a way to write, even before the first entry", async () => {
    byUser.mockResolvedValue({ entries: [], page: 1, hasMore: false });
    renderIt(true);
    expect(await screen.findByRole("link", { name: "Write an entry" })).toHaveAttribute("href", "/blog/new");
    expect(screen.getByText(/Nothing written yet/)).toBeInTheDocument();
  });

  it("shows more, without repeating entries already shown", async () => {
    byUser.mockResolvedValueOnce({ entries: [entry(2), entry(1)], page: 1, hasMore: true });
    byUser.mockResolvedValueOnce({ entries: [entry(1), entry(0)], page: 2, hasMore: false });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Show more entries" }));
    expect(byUser).toHaveBeenLastCalledWith("zoe", 2);
    expect(await screen.findByRole("link", { name: /Entry 0/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Entry 1/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more entries" })).not.toBeInTheDocument();
  });

  it("says so when more entries can't be loaded, and keeps the ones it has", async () => {
    byUser.mockResolvedValueOnce({ entries: [entry(1)], page: 1, hasMore: true });
    byUser.mockRejectedValueOnce(new ApiError(500, "boom"));
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Show more entries" }));
    expect(await screen.findByText("Couldn't load more entries.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Entry 1/ })).toBeInTheDocument();
  });

  it("shows nothing if the profile can't be read", async () => {
    byUser.mockRejectedValue(new ApiError(403, "This profile is private"));
    renderIt();
    await vi.waitFor(() => expect(byUser).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Blog" })).not.toBeInTheDocument();
  });
});
