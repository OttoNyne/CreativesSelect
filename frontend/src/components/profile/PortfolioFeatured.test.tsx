import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioGrid } from "./PortfolioGrid";
import { mediaApi } from "../../api/media.api";
import { albumsApi } from "../../api/albums.api";
import { useAuth } from "../../context/AuthContext";
import type { MediaItem } from "../../types";

vi.mock("../../api/media.api", () => ({
  mediaApi: { byUser: vi.fn(), create: vi.fn(), remove: vi.fn(), react: vi.fn(), setAlbum: vi.fn(), setCaption: vi.fn(), feature: vi.fn(), unfeature: vi.fn() },
  uploadFile: vi.fn(),
}));
vi.mock("../../api/albums.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/albums.api")>()),
  albumsApi: { byUser: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../ai/GenerateImageButton", () => ({ GenerateImageButton: () => null }));
vi.mock("../ai/ImageSearchPicker", () => ({ ImageSearchPicker: () => null }));

const api = vi.mocked(mediaApi);
const item = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  id,
  ownerId: "me",
  url: `https://images.example.com/${id}.jpg`,
  type: "image",
  caption: id,
  isAiImage: false,
  reactions: { counts: { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0 }, total: 0, mine: null },
  createdAt: "",
  ...over,
}) as MediaItem;

const order = () => [...document.querySelectorAll("[id^='piece-']")].map((el) => el.id.replace("piece-", ""));

function show(isOwner: boolean, items: MediaItem[]) {
  api.byUser.mockResolvedValue({ media: items });
  vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "me" } as never, isLoading: false, setUser: () => {}, refresh: async () => {} });
  render(<PortfolioGrid username="me" isOwner={isOwner} />);
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.feature.mockResolvedValue({ featured: true });
  api.unfeature.mockResolvedValue(undefined as never);
  Object.values(vi.mocked(albumsApi)).forEach((fn) => fn.mockReset());
  vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [] });
});

describe("PortfolioGrid: the featured piece", () => {
  it("marks the featured piece, which the server sends first", async () => {
    show(false, [item("a", { featured: true, createdAt: "2026-01-01T00:00:00Z" }), item("b", { createdAt: "2026-03-01T00:00:00Z" })]);
    await screen.findByText("b");
    expect(order()).toEqual(["a", "b"]);
    expect(within(document.getElementById("piece-a")!).getByText(/Featured/)).toBeInTheDocument();
    expect(within(document.getElementById("piece-b")!).queryByText(/Featured/)).toBeNull();
  });

  it("offers a visitor no Feature button", async () => {
    show(false, [item("a")]);
    await screen.findByText("a");
    expect(screen.queryByRole("button", { name: /Feature this piece/ })).toBeNull();
  });

  it("lets the owner feature a piece, which then moves to the front, and one at a time", async () => {
    show(true, [item("a", { createdAt: "2026-03-01T00:00:00Z" }), item("b", { createdAt: "2026-02-01T00:00:00Z" }), item("c", { createdAt: "2026-01-01T00:00:00Z" })]);
    await screen.findByText("c");
    await userEvent.click(within(document.getElementById("piece-c")!).getByRole("button", { name: "Feature this piece first in your portfolio" }));
    expect(api.feature).toHaveBeenCalledWith("c");
    expect(order()).toEqual(["c", "a", "b"]);
    expect(within(document.getElementById("piece-c")!).getByText(/Featured/)).toBeInTheDocument();
    // featuring another takes the first one's place
    await userEvent.click(within(document.getElementById("piece-b")!).getByRole("button", { name: "Feature this piece first in your portfolio" }));
    expect(order()).toEqual(["b", "a", "c"]);
    expect(screen.getAllByText(/Featured/)).toHaveLength(1);
  });

  it("puts the pieces back in newest-first order when the owner stops featuring", async () => {
    show(true, [item("c", { featured: true, createdAt: "2026-01-01T00:00:00Z" }), item("a", { createdAt: "2026-03-01T00:00:00Z" }), item("b", { createdAt: "2026-02-01T00:00:00Z" })]);
    await screen.findByText("b");
    await userEvent.click(within(document.getElementById("piece-c")!).getByRole("button", { name: "Stop featuring this piece" }));
    expect(api.unfeature).toHaveBeenCalledWith("c");
    expect(order()).toEqual(["a", "b", "c"]);
    expect(screen.queryByText(/Featured/)).toBeNull();
  });
});
