import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SearchPage } from "./SearchPage";
import { profilesApi } from "../api/profiles.api";
import { searchApi } from "../api/search.api";
import { ApiError } from "../api/client";

vi.mock("../api/profiles.api", () => ({ profilesApi: { discover: vi.fn(), tags: vi.fn() } }));
vi.mock("../api/search.api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/search.api")>()), searchApi: { search: vi.fn() } }));
// the real one is generic in what it returns; the tests hand it whatever shape the page under test expects
const search = vi.mocked(searchApi.search) as unknown as ReturnType<typeof vi.fn>;
const discover = vi.mocked(profilesApi.discover);
const tags = vi.mocked(profilesApi.tags);

const zoe = { id: "1", username: "zoe", displayName: "Zoe", bio: "Potter", mood: "calm", tags: ["potter", "ceramics"] } as never;
const ana = { id: "2", username: "ana", displayName: "Ana", tags: ["potter"] } as never;

function renderPage(url = "/search") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <SearchPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  [search, discover, tags].forEach((fn) => fn.mockReset());
  tags.mockResolvedValue({ tags: [{ tag: "potter", count: 2 }, { tag: "ceramics", count: 1 }] });
  discover.mockResolvedValue({ users: [zoe, ana], page: 1, hasMore: false });
});

describe("SearchPage: searching", () => {
  const box = () => screen.getByPlaceholderText("Search people, writing, groups…");
  const none = (words: string[], type = "people") => ({ type, words, results: [], page: 1, hasMore: false });

  it("searches people by the trimmed question and links each result to its profile, marking what matched", async () => {
    search.mockResolvedValue({ type: "people", words: ["zo"], results: [{ id: "1", username: "zoe", displayName: "Zoe", mutualCount: 2, isFriend: false }], page: 1, hasMore: false });
    renderPage();
    await userEvent.type(box(), "  zo  {enter}");

    expect(search).toHaveBeenCalledWith({ q: "zo", type: "people", tag: "", connection: "any" });
    const results = await screen.findByRole("region", { name: "Search results" });
    expect(within(results).getByRole("link", { name: /Zoe/ })).toHaveAttribute("href", "/u/zoe");
    expect(within(results).getAllByText("Zo", { selector: "mark" }).length).toBeGreaterThan(0);
    expect(within(results).getByText("2 friends in common")).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    search.mockResolvedValue(none(["nobody"]));
    renderPage();
    await userEvent.type(box(), "nobody{enter}");
    expect(await screen.findByText("No creatives found.")).toBeInTheDocument();
  });

  it("ignores a blank question", async () => {
    renderPage();
    await userEvent.type(box(), "   {enter}");
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "New creatives" })).toBeInTheDocument();
  });

  it("shows an error when the search fails", async () => {
    search.mockRejectedValue(new ApiError(429, "You are searching very quickly."));
    renderPage();
    await userEvent.type(box(), "zoe{enter}");
    expect(await screen.findByText("You are searching very quickly.")).toBeInTheDocument();
  });

  it("goes back to browsing from the results", async () => {
    search.mockResolvedValue(none(["nobody"]));
    renderPage();
    await userEvent.type(box(), "nobody{enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Back to browsing" }));
    expect(await screen.findByRole("region", { name: "New creatives" })).toBeInTheDocument();
    expect(box()).toHaveValue("");
  });

  it("opens already searching when the address has a question, kind and filters (so a search can be shared)", async () => {
    search.mockResolvedValue(none(["kiln"]));
    renderPage("/search?q=kiln&type=people&tag=potter&connection=friends");
    expect(box()).toHaveValue("kiln");
    await screen.findByText("No creatives found.");
    expect(search).toHaveBeenCalledWith({ q: "kiln", type: "people", tag: "potter", connection: "friends" });
    expect(screen.getByLabelText("Show")).toHaveValue("friends");
    expect(screen.getByRole("button", { name: "Stop filtering by potter" })).toBeInTheDocument();
  });

  it("ignores a kind or filter in the address that isn't one", async () => {
    search.mockResolvedValue(none(["kiln"]));
    renderPage("/search?q=kiln&type=everything&connection=strangers");
    await screen.findByText("No creatives found.");
    expect(search).toHaveBeenCalledWith({ q: "kiln", type: "people", tag: "", connection: "any" });
  });

  it("offers every kind, and searching another kind keeps the question", async () => {
    search.mockResolvedValue(none(["kiln"]));
    renderPage("/search?q=kiln");
    const tabs = await screen.findByRole("tablist", { name: "What to search" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["People", "Blog entries", "Groups", "Group topics", "Help wanted"]);
    expect(within(tabs).getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");

    search.mockResolvedValue({ type: "blog", words: ["kiln"], results: [{ id: "b1", title: "Firing the kiln", snippet: "a long day at the kiln", createdAt: "2026-01-02T00:00:00Z", commentCount: 3, author: { id: "9", username: "wren", displayName: "Wren" } }], page: 1, hasMore: false });
    await userEvent.click(within(tabs).getByRole("tab", { name: "Blog entries" }));
    expect(search).toHaveBeenLastCalledWith({ q: "kiln", type: "blog", tag: "", connection: "any" });
    const results = await screen.findByRole("region", { name: "Search results" });
    expect(await within(results).findByRole("link", { name: /Firing the/ })).toHaveAttribute("href", "/blog/b1");
    expect(within(results).getByText(/3 comments/)).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "Blog entries" })).toHaveAttribute("aria-selected", "true");
    // the filters for people are gone
    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
  });

  it("changes who is shown, and picks a tag from someone's card to filter by", async () => {
    search.mockResolvedValue({ type: "people", words: ["zo"], results: [{ ...(zoe as object), mutualCount: 0, isFriend: false }], page: 1, hasMore: false });
    renderPage("/search?q=zo");
    await screen.findByRole("link", { name: /Zoe/ });
    await userEvent.selectOptions(screen.getByLabelText("Show"), "mutual");
    expect(search).toHaveBeenLastCalledWith({ q: "zo", type: "people", tag: "", connection: "mutual" });
    await userEvent.click(await screen.findByRole("button", { name: "Browse everyone tagged potter" }));
    expect(search).toHaveBeenLastCalledWith({ q: "zo", type: "people", tag: "potter", connection: "mutual" });
    await userEvent.click(await screen.findByRole("button", { name: "Stop filtering by potter" }));
    expect(search).toHaveBeenLastCalledWith({ q: "zo", type: "people", tag: "", connection: "mutual" });
  });

  it("shows more, without repeating anyone", async () => {
    search.mockResolvedValueOnce({ type: "people", words: ["zo"], results: [{ id: "1", username: "zoe", displayName: "Zoe" }], page: 1, hasMore: true });
    renderPage("/search?q=zo");
    await screen.findByRole("link", { name: /Zoe/ });
    search.mockResolvedValueOnce({ type: "people", words: ["zo"], results: [{ id: "1", username: "zoe", displayName: "Zoe" }, { id: "2", username: "zora", displayName: "Zora" }], page: 2, hasMore: false });
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(search).toHaveBeenLastCalledWith({ q: "zo", type: "people", tag: "", connection: "any", page: 2 });
    expect(await screen.findByRole("link", { name: /Zora/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Zoe/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });
});

describe("SearchPage: discovering by tag", () => {
  it("lists the newest creatives with their mood and tags, and the tags people use", async () => {
    renderPage();

    const newest = await screen.findByRole("region", { name: "New creatives" });
    expect(await within(newest).findByRole("link", { name: /Zoe/ })).toHaveAttribute("href", "/u/zoe");
    expect(within(newest).getByText("calm")).toBeInTheDocument();
    expect(within(newest).getByRole("link", { name: /Ana/ })).toBeInTheDocument();
    expect(discover).toHaveBeenCalledWith({ tag: undefined });

    const popular = await screen.findByRole("region", { name: "Browse by tag" });
    expect(within(popular).getByRole("button", { name: /#potter/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(popular).getByRole("button", { name: /#ceramics/ })).toBeInTheDocument();
  });

  it("filters to a tag chosen from the popular tags, and clears it again", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /#potter 2/ }));

    expect(await screen.findByRole("region", { name: "Creatives tagged potter" })).toBeInTheDocument();
    expect(discover).toHaveBeenLastCalledWith({ tag: "potter" });
    expect(screen.getByRole("button", { name: /#potter 2/ })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Show everyone" }));
    expect(await screen.findByRole("region", { name: "New creatives" })).toBeInTheDocument();
    expect(discover).toHaveBeenLastCalledWith({ tag: undefined });
  });

  it("filters to a tag chosen on someone's card", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Browse everyone tagged ceramics" }));
    expect(await screen.findByRole("region", { name: "Creatives tagged ceramics" })).toBeInTheDocument();
    expect(discover).toHaveBeenLastCalledWith({ tag: "ceramics" });
  });

  it("opens already filtered when the address has a tag, as a profile's tag link does", async () => {
    renderPage("/search?tag=Lo-Fi");
    expect(await screen.findByRole("region", { name: "Creatives tagged lo-fi" })).toBeInTheDocument();
    expect(discover).toHaveBeenCalledWith({ tag: "lo-fi" });
  });

  it("ignores a tag in the address that couldn't be one", async () => {
    renderPage("/search?tag=%3Cscript%3E");
    expect(await screen.findByRole("region", { name: "New creatives" })).toBeInTheDocument();
    expect(discover).toHaveBeenCalledWith({ tag: undefined });
  });

  it("says when no one has the tag", async () => {
    discover.mockResolvedValue({ users: [], page: 1, hasMore: false });
    renderPage("/search?tag=mime");
    expect(await screen.findByText("No one has tagged themselves #mime yet.")).toBeInTheDocument();
  });

  it("shows more, without repeating anyone already shown", async () => {
    discover.mockResolvedValueOnce({ users: [zoe], page: 1, hasMore: true });
    discover.mockResolvedValueOnce({ users: [zoe, ana], page: 2, hasMore: false });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(discover).toHaveBeenLastCalledWith({ tag: undefined, page: 2 });
    expect(await screen.findByRole("link", { name: /Ana/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Zoe/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("says so when the list can't be loaded, and still lets people search by name", async () => {
    discover.mockRejectedValue(new ApiError(500, "boom"));
    tags.mockRejectedValue(new ApiError(500, "boom"));
    renderPage();
    expect(await screen.findByText("Couldn't load creatives right now.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Browse by tag" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search people, writing, groups…")).toBeInTheDocument();
  });
});
