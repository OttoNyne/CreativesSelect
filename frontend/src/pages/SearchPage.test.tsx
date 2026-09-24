import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SearchPage } from "./SearchPage";
import { profilesApi } from "../api/profiles.api";
import { ApiError } from "../api/client";

vi.mock("../api/profiles.api", () => ({ profilesApi: { search: vi.fn() } }));
const search = vi.mocked(profilesApi.search);

function renderPage() {
  render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  search.mockReset();
});

describe("SearchPage", () => {
  it("searches by the trimmed query and links each result to its profile", async () => {
    search.mockResolvedValue({ users: [{ id: "1", username: "zoe", displayName: "Zoe" } as never] });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Search creatives…"), "  zo  {enter}");

    expect(search).toHaveBeenCalledWith("zo");
    const link = await screen.findByRole("link", { name: /Zoe/ });
    expect(link).toHaveAttribute("href", "/u/zoe");
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
});
