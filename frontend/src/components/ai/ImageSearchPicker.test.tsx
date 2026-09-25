import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageSearchPicker } from "./ImageSearchPicker";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import type { ImageSearchResult } from "../../types";

vi.mock("../../api/ai.api", () => ({ aiApi: { searchImages: vi.fn() } }));
const search = vi.mocked(aiApi.searchImages);

const result = (id: string, title: string): ImageSearchResult =>
  ({ id, url: `https://cdn.example.com/${id}.jpg`, thumbnailUrl: `https://cdn.example.com/${id}-t.jpg`, title, creator: "Ann" }) as ImageSearchResult;

beforeEach(() => {
  search.mockReset();
});

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "🔍 Search photos" }));
}

describe("ImageSearchPicker", () => {
  it("starts closed and opens on click", async () => {
    render(<ImageSearchPicker onSelect={() => {}} />);
    expect(screen.queryByPlaceholderText(/Describe the image/)).not.toBeInTheDocument();
    await open();
    expect(screen.getByPlaceholderText(/Describe the image/)).toBeInTheDocument();
    expect(screen.getByText(/Openverse/)).toBeInTheDocument();
  });

  it("searches by the trimmed text and shows the results", async () => {
    search.mockResolvedValue({ results: [result("a", "A fox"), result("b", "Another fox")] });
    render(<ImageSearchPicker onSelect={() => {}} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/Describe the image/), "  red fox  {enter}");

    expect(search).toHaveBeenCalledWith("red fox");
    expect(await screen.findByAltText("A fox")).toBeInTheDocument();
    expect(screen.getByAltText("Another fox")).toBeInTheDocument();
  });

  it("picking a photo hands back its full-size URL and closes the picker", async () => {
    search.mockResolvedValue({ results: [result("a", "A fox")] });
    const onSelect = vi.fn();
    render(<ImageSearchPicker onSelect={onSelect} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/Describe the image/), "fox{enter}");
    await userEvent.click(await screen.findByAltText("A fox"));

    expect(onSelect).toHaveBeenCalledWith("https://cdn.example.com/a.jpg");
    expect(screen.queryByPlaceholderText(/Describe the image/)).not.toBeInTheDocument();
  });

  it("ignores a blank search", async () => {
    render(<ImageSearchPicker onSelect={() => {}} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/Describe the image/), "   {enter}");
    expect(search).not.toHaveBeenCalled();
  });

  it("says so when nothing matches", async () => {
    search.mockResolvedValue({ results: [] });
    render(<ImageSearchPicker onSelect={() => {}} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/Describe the image/), "zzzz{enter}");
    expect(await screen.findByText("No photos found for that.")).toBeInTheDocument();
  });

  it("shows the server's message if the search fails", async () => {
    search.mockRejectedValue(new ApiError(502, "Photo search is unavailable right now"));
    render(<ImageSearchPicker onSelect={() => {}} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/Describe the image/), "fox{enter}");
    expect(await screen.findByText("Photo search is unavailable right now")).toBeInTheDocument();
  });

  it("uses the label it's given", () => {
    render(<ImageSearchPicker onSelect={() => {}} label="Find a wallpaper" />);
    expect(screen.getByRole("button", { name: "Find a wallpaper" })).toBeInTheDocument();
  });
});
