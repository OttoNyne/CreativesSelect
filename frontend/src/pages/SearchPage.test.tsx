import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SearchPage } from "./SearchPage";
import { profilesApi } from "../api/profiles.api";
import { ApiError } from "../api/client";

vi.mock("../api/profiles.api", () => ({ profilesApi: { search: vi.fn(), discover: vi.fn(), tags: vi.fn() } }));
const search = vi.mocked(profilesApi.search);
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

describe("SearchPage: searching by name", () => {
  it("searches by the trimmed query and links each result to its profile", async () => {
    search.mockResolvedValue({ users: [{ id: "1", username: "zoe", displayName: "Zoe" } as never] });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Search creatives…"), "  zo  {enter}");

    expect(search).toHaveBeenCalledWith("zo");
    const results = await screen.findByRole("region", { name: "Search results" });
    expect(within(results).getByRole("link", { name: /Zoe/ })).toHaveAttribute("href", "/u/zoe");
  });

  it("says so when nothing matches", async () => {
    search.mockResolvedValue({ users: [] });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Search creatives…"), "nobody{enter}");
    expect(await screen.findByText("No creatives found.")).toBeInTheDocument();
  });

  it("ignores a blank query", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Search creatives…"), "   {enter}");
    expect(search).not.toHaveBeenCalled();
  });

  it("shows an error when the search fails", async () => {
    search.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Search creatives…"), "zoe{enter}");
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });

  it("goes back to browsing from the results", async () => {
    search.mockResolvedValue({ users: [] });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Search creatives…"), "nobody{enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Back to browsing" }));
    expect(await screen.findByRole("region", { name: "New creatives" })).toBeInTheDocument();
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
    expect(screen.getByPlaceholderText("Search creatives…")).toBeInTheDocument();
  });
});
