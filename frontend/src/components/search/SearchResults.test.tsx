import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SearchResults } from "./SearchResults";
import { searchApi } from "../../api/search.api";
import type { SearchType } from "../../api/search.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/search.api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../api/search.api")>()), searchApi: { search: vi.fn() } }));
// the real one is generic in what it returns; the tests hand it whatever each kind of result looks like
const search = vi.mocked(searchApi.search) as unknown as ReturnType<typeof vi.fn>;

const wren = { id: "9", username: "wren", displayName: "Wren", avatarUrl: null };

function renderResults(type: SearchType, results: unknown[], words = ["kiln"]) {
  search.mockResolvedValue({ type, words, results, page: 1, hasMore: false });
  render(
    <MemoryRouter>
      <SearchResults q="kiln" type={type} tag="" connection="any" onTag={() => {}} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  search.mockReset();
});

describe("SearchResults", () => {
  it("shows people with how they know you", async () => {
    renderResults("people", [{ ...wren, bio: "I fire a kiln", mutualCount: 1, isFriend: true }]);
    expect(await screen.findByRole("link", { name: /Wren/ })).toHaveAttribute("href", "/u/wren");
    expect(screen.getByText("Your friend · 1 friend in common")).toBeInTheDocument();
    expect(screen.getByText("kiln", { selector: "mark" })).toBeInTheDocument();
  });

  it("marks a verified person with the CSverified badge, and no one else", async () => {
    renderResults("people", [{ ...wren, csVerified: true, mutualCount: 0, isFriend: false }, { id: "8", username: "max", displayName: "Max", mutualCount: 0, isFriend: false }]);
    await screen.findByRole("link", { name: /Wren/ });
    expect(screen.getAllByRole("img", { name: "CSverified" })).toHaveLength(1);
  });

  it("shows a blog entry with its author, date, comments and where it matched", async () => {
    renderResults("blog", [{ id: "b1", title: "Kiln day", snippet: "…we lit the kiln at dawn…", createdAt: "2026-03-04T12:00:00Z", commentCount: 1, author: wren }]);
    expect(await screen.findByRole("link", { name: /Kiln/ })).toHaveAttribute("href", "/blog/b1");
    expect(screen.getByRole("link", { name: "Wren" })).toHaveAttribute("href", "/u/wren");
    expect(screen.getByText(/1 comment$/)).toBeInTheDocument();
    expect(screen.getAllByText("kiln", { selector: "mark" }).length).toBeGreaterThan(0);
  });

  it("shows a group with its size and whether you are in it", async () => {
    renderResults("groups", [{ id: "g1", name: "Kiln club", description: "Firing together", snippet: "", memberCount: 1, isMember: true, createdById: "9", createdAt: "", bannerUrl: null }]);
    expect(await screen.findByRole("link", { name: /Kilns*club/ })).toHaveAttribute("href", "/groups/g1");
    expect(screen.getByText(/1 member · You are in this group/)).toBeInTheDocument();
    expect(screen.getByText("Firing together")).toBeInTheDocument();
  });

  it("shows a group topic with its group, author and replies, linking to the group", async () => {
    renderResults("topics", [{ id: "t1", groupId: "g1", groupName: "Potters", title: "Which kiln?", snippet: "budget kiln", replyCount: 2, lastActivityAt: "", author: wren }]);
    expect(await screen.findByRole("link", { name: /Which/ })).toHaveAttribute("href", "/groups/g1");
    expect(screen.getByText(/in Potters/)).toBeInTheDocument();
    expect(screen.getByText(/2 replies/)).toBeInTheDocument();
  });

  it("shows a Help wanted request linking to the board", async () => {
    renderResults("help", [{ id: "h1", title: "Need a kiln shelf", snippet: "", priority: "high", dueDate: "2026-06-01T00:00:00Z", createdAt: "", author: wren }]);
    expect(await screen.findByRole("link", { name: /Need a/ })).toHaveAttribute("href", "/help-wanted");
    expect(screen.getByText(/high priority · due /)).toBeInTheDocument();
  });

  it("says what was not found, for each kind", async () => {
    renderResults("topics", []);
    expect(await screen.findByText(/No group topics found\. Only the groups you have joined are searched\./)).toBeInTheDocument();
  });

  it("shows an error if the search fails, and not the nothing-found message", async () => {
    search.mockRejectedValue(new ApiError(503, "That search took too long."));
    render(
      <MemoryRouter>
        <SearchResults q="kiln" type="blog" tag="" connection="any" onTag={() => {}} />
      </MemoryRouter>
    );
    expect(await screen.findByText("That search took too long.")).toBeInTheDocument();
    expect(screen.queryByText(/No blog entries found/)).not.toBeInTheDocument();
  });
});
