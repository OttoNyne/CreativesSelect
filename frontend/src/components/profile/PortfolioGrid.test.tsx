import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioGrid } from "./PortfolioGrid";
import { mediaApi, uploadFile } from "../../api/media.api";
import { albumsApi } from "../../api/albums.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { checkVideoFile } from "../../lib/video";
import type { MediaItem, ReactionKey, ReactionSummary } from "../../types";

vi.mock("../../api/media.api", () => ({
  mediaApi: { byUser: vi.fn(), create: vi.fn(), remove: vi.fn(), react: vi.fn(), setAlbum: vi.fn(), setCaption: vi.fn() },
  uploadFile: vi.fn(),
}));
vi.mock("../../api/albums.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/albums.api")>()),
  albumsApi: { byUser: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../lib/video", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/video")>()),
  checkVideoFile: vi.fn(),
}));
vi.mock("../ai/GenerateImageButton", () => ({
  GenerateImageButton: ({ onGenerated }: { onGenerated: (url: string) => void }) => (
    <button type="button" onClick={() => onGenerated("https://cdn.example.com/generated.jpg")}>
      fake-generate
    </button>
  ),
}));
vi.mock("../ai/ImageSearchPicker", () => ({
  ImageSearchPicker: ({ onSelect }: { onSelect: (url: string) => void }) => (
    <button type="button" onClick={() => onSelect("https://images.example.com/found.jpg")}>
      fake-search-pick
    </button>
  ),
}));
const api = vi.mocked(mediaApi);
const upload = vi.mocked(uploadFile);

function item(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "m1",
    ownerId: "me",
    url: "https://images.example.com/a.jpg",
    type: "image",
    caption: null,
    isAiImage: false,
    reactions: { counts: { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0 }, total: 0, mine: null },
    createdAt: "",
    ...over,
  };
}

function renderGrid(isOwner: boolean, signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({
    user: signedIn ? ({ id: "me", username: "me" } as never) : null,
    isLoading: false,
    setUser: () => {},
    refresh: async () => {},
  });
  return render(<PortfolioGrid username="me" isOwner={isOwner} />);
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  upload.mockReset();
  vi.restoreAllMocks();
  api.byUser.mockResolvedValue({ media: [item({ id: "m1" }), item({ id: "m2", url: "https://images.example.com/b.jpg" })] });
  Object.values(vi.mocked(albumsApi)).forEach((fn) => fn.mockReset());
  vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [] });
});

describe("PortfolioGrid: albums", () => {
  const sketch = { id: "a1", title: "Sketchbook", count: 1 };
  const murals = { id: "a2", title: "Murals", count: 0 };
  const inAlbum = () => api.byUser.mockResolvedValue({ media: [item({ id: "m1", albumId: "a1", caption: "In sketchbook" }), item({ id: "m2", caption: "Loose one" })] });

  it("shows nothing about albums to a visitor when there are none, and lets the owner start one", async () => {
    const { unmount } = renderGrid(false);
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
    expect(screen.queryByRole("list", { name: "Albums" })).not.toBeInTheDocument();
    unmount();
    renderGrid(true);
    expect(await screen.findByRole("button", { name: "+ New album" })).toBeInTheDocument();
  });

  it("shows a visitor the albums with how many pieces each holds, and filters to one", async () => {
    inAlbum();
    vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [sketch, murals] });
    renderGrid(false);
    expect(await screen.findByRole("button", { name: "All pieces (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sketchbook (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Murals (0)" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Sketchbook (1)" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "In sketchbook");

    await userEvent.click(screen.getByRole("button", { name: "Murals (0)" }));
    expect(screen.getByText("Nothing in this album yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All pieces (2)" }));
    expect(screen.getAllByRole("img")).toHaveLength(2);
    // a visitor can't change anything
    expect(screen.queryByRole("button", { name: "+ New album" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("lets the owner make an album, which opens it", async () => {
    vi.mocked(albumsApi.create).mockResolvedValue({ album: { id: "a9", title: "Fresh", count: 0 } });
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "+ New album" }));
    await userEvent.type(screen.getByLabelText("Album name"), "Fresh");
    await userEvent.click(screen.getByRole("button", { name: "Create album" }));
    expect(albumsApi.create).toHaveBeenCalledWith("Fresh");
    expect(await screen.findByRole("button", { name: "Fresh (0)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Nothing in this album yet.")).toBeInTheDocument();
  });

  it("moves a piece into an album from its menu, and the counts follow", async () => {
    vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [sketch, murals] });
    api.setAlbum.mockResolvedValue({ item: item({ id: "m1", albumId: "a2" }) });
    renderGrid(true);
    const menus = await screen.findAllByRole("combobox");
    expect(menus).toHaveLength(2);
    await userEvent.selectOptions(menus[0], "a2");
    expect(api.setAlbum).toHaveBeenCalledWith("m1", "a2");
    expect(await screen.findByRole("button", { name: "Murals (1)" })).toBeInTheDocument();
  });

  it("takes a piece out of its album", async () => {
    inAlbum();
    vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [sketch] });
    api.setAlbum.mockResolvedValue({ item: item({ id: "m1", albumId: null }) });
    renderGrid(true);
    await screen.findByRole("button", { name: "Sketchbook (1)" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Album for In sketchbook" }), "");
    expect(api.setAlbum).toHaveBeenCalledWith("m1", null);
    expect(await screen.findByRole("button", { name: "Sketchbook (0)" })).toBeInTheDocument();
  });

  it("says so, and leaves the piece where it was, when it can't be moved", async () => {
    vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [sketch] });
    api.setAlbum.mockRejectedValue(new ApiError(500, "boom"));
    renderGrid(true);
    await userEvent.selectOptions((await screen.findAllByRole("combobox"))[0], "a1");
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sketchbook (0)" })).toBeInTheDocument();
  });

  it("renames and deletes an album, and the pieces stay", async () => {
    inAlbum();
    vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [sketch] });
    vi.mocked(albumsApi.rename).mockResolvedValue({ album: { ...sketch, title: "Renamed" } });
    vi.mocked(albumsApi.remove).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "Sketchbook (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename this album" }));
    const box = screen.getByLabelText("New name for this album");
    expect(box).toHaveValue("Sketchbook");
    await userEvent.clear(box);
    await userEvent.type(box, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(albumsApi.rename).toHaveBeenCalledWith("a1", "Renamed");
    await userEvent.click(await screen.findByRole("button", { name: "Delete this album" }));
    expect(albumsApi.remove).toHaveBeenCalledWith("a1");
    expect(await screen.findByRole("button", { name: "All pieces (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Renamed/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("doesn't delete an album the owner changed their mind about", async () => {
    inAlbum();
    vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: [sketch] });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "Sketchbook (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete this album" }));
    expect(albumsApi.remove).not.toHaveBeenCalled();
  });

  it("shows the server's reason when an album can't be made, and keeps the name typed", async () => {
    vi.mocked(albumsApi.create).mockRejectedValue(new ApiError(409, "You already have an album with that name"));
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "+ New album" }));
    await userEvent.type(screen.getByLabelText("Album name"), "Dup");
    await userEvent.click(screen.getByRole("button", { name: "Create album" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already have an album");
    expect(screen.getByLabelText("Album name")).toHaveValue("Dup");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Album name")).not.toBeInTheDocument();
  });

  it("stops offering new albums at the limit, and copes with albums that can't be loaded", async () => {
    vi.mocked(albumsApi.byUser).mockResolvedValue({ albums: Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, title: `Album ${i}`, count: 0 })) });
    renderGrid(true);
    await screen.findByRole("button", { name: "Album 11 (0)" });
    expect(screen.queryByRole("button", { name: "+ New album" })).not.toBeInTheDocument();
  });

  it("still shows the portfolio when albums can't be loaded", async () => {
    vi.mocked(albumsApi.byUser).mockRejectedValue(new ApiError(500, "boom"));
    renderGrid(false);
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
    expect(screen.queryByRole("list", { name: "Albums" })).not.toBeInTheDocument();
  });
});

describe("PortfolioGrid: removing pictures", () => {
  it("shows a remove button on every piece for the owner — always visible, not hover-only", async () => {
    renderGrid(true);
    const buttons = await screen.findAllByRole("button", { name: "Remove from portfolio" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0].className).not.toMatch(/opacity-0|group-hover/);
  });

  it("asks first, then removes the piece", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.remove.mockResolvedValue(undefined);
    renderGrid(true);
    await userEvent.click((await screen.findAllByRole("button", { name: "Remove from portfolio" }))[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(api.remove).toHaveBeenCalledWith("m1");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Remove from portfolio" })).toHaveLength(1));
  });

  it("keeps the piece if you cancel the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderGrid(true);
    await userEvent.click((await screen.findAllByRole("button", { name: "Remove from portfolio" }))[0]);
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Remove from portfolio" })).toHaveLength(2);
  });

  it("shows the server's message if removal fails, and keeps the piece", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.remove.mockRejectedValue(new ApiError(403, "Not allowed"));
    renderGrid(true);
    await userEvent.click((await screen.findAllByRole("button", { name: "Remove from portfolio" }))[0]);
    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove from portfolio" })).toHaveLength(2);
  });

  it("gives visitors no remove buttons", async () => {
    renderGrid(false);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    expect(screen.queryByRole("button", { name: "Remove from portfolio" })).not.toBeInTheDocument();
  });
});

describe("PortfolioGrid: emoji reactions", () => {
  const summary = (counts: Partial<Record<ReactionKey, number>> = {}, mine: ReactionKey | null = null): ReactionSummary => {
    const full = { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0, ...counts };
    return { counts: full, total: Object.values(full).reduce((a, n) => a + n, 0), mine };
  };

  it("shows each emoji that has been used, with how many, and marks the viewer's own", async () => {
    api.byUser.mockResolvedValue({ media: [item({ reactions: summary({ like: 3, fire: 1 }, "fire") })] });
    renderGrid(false);
    const like = await screen.findByRole("button", { name: "Like: 3" });
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(like).toHaveTextContent("👍 3");
    const fire = screen.getByRole("button", { name: "Fire: 1, your reaction" });
    expect(fire).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^Love/ })).not.toBeInTheDocument(); // none used, none shown
  });

  it("opens the six to choose from, and reacts with the one chosen", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1" })] });
    api.react.mockResolvedValue({ reactions: summary({ love: 1 }, "love") });
    renderGrid(false);
    await userEvent.click(await screen.findByRole("button", { name: "Add a reaction" }));
    const picker = screen.getByRole("group", { name: "Pick a reaction" });
    expect(within(picker).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Like", "Love", "Haha", "Wow", "Sad", "Fire"]);
    await userEvent.click(within(picker).getByRole("button", { name: "Love" }));
    expect(api.react).toHaveBeenCalledWith("m1", "love");
    expect(await screen.findByRole("button", { name: "Love: 1, your reaction" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("group", { name: "Pick a reaction" })).not.toBeInTheDocument(); // closes once chosen
  });

  it("takes a reaction away by choosing it again, from its own button or from the six", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", reactions: summary({ love: 1 }, "love") })] });
    api.react.mockResolvedValueOnce({ reactions: summary() }).mockResolvedValueOnce({ reactions: summary({ love: 1 }, "love") }).mockResolvedValueOnce({ reactions: summary() });
    renderGrid(false);
    await userEvent.click(await screen.findByRole("button", { name: "Love: 1, your reaction" }));
    expect(api.react).toHaveBeenLastCalledWith("m1", null);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Love: / })).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Pick a reaction" })).getByRole("button", { name: "Love" }));
    await screen.findByRole("button", { name: "Love: 1, your reaction" });
    await userEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    expect(within(screen.getByRole("group", { name: "Pick a reaction" })).getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(screen.getByRole("group", { name: "Pick a reaction" })).getByRole("button", { name: "Love" }));
    expect(api.react).toHaveBeenLastCalledWith("m1", null);
  });

  it("switches from one emoji to another, showing what the server says", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", reactions: summary({ like: 2 }, "like") })] });
    api.react.mockResolvedValue({ reactions: summary({ like: 1, fire: 1 }, "fire") });
    renderGrid(false);
    await userEvent.click(await screen.findByRole("button", { name: "Add a reaction" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Pick a reaction" })).getByRole("button", { name: "Fire" }));
    expect(api.react).toHaveBeenCalledWith("m1", "fire");
    expect(await screen.findByRole("button", { name: "Fire: 1, your reaction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like: 1" })).toBeInTheDocument();
  });

  it("shows the counts to someone who isn't signed in, with nothing to press", async () => {
    api.byUser.mockResolvedValue({ media: [item({ reactions: summary({ like: 4, laugh: 2 }) }), item({ id: "m2", reactions: summary() })] });
    renderGrid(false, false);
    const like = await screen.findByRole("button", { name: "Like: 4" });
    expect(like).toBeDisabled();
    expect(like).toHaveAttribute("title", "Log in to react");
    expect(screen.getByRole("button", { name: "Haha: 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add a reaction" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Reactions to this piece" })).toHaveLength(1); // the piece with none shows nothing
  });

  it("shows the server's message if reacting fails, and leaves things as they were", async () => {
    api.byUser.mockResolvedValue({ media: [item({ reactions: summary({ like: 1 }) })] });
    api.react.mockRejectedValue(new ApiError(429, "You're reacting too fast — try again in a bit"));
    renderGrid(false);
    await userEvent.click(await screen.findByRole("button", { name: "Like: 1" }));
    expect(await screen.findByText(/reacting too fast/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like: 1" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("PortfolioGrid: videos", () => {
  it("plays an uploaded video with controls, inline on phones", async () => {
    api.byUser.mockResolvedValue({
      media: [item({ type: "video", url: "https://res.cloudinary.com/demo/video/upload/v1/x/clip.mov", durationSeconds: 12 })],
    });
    const { container } = renderGrid(false);
    await screen.findByRole("button", { name: "Add a reaction" });
    const el = container.querySelector("video")!;
    expect(el).toHaveAttribute("controls");
    expect(el).toHaveAttribute("playsinline");
    expect(el.getAttribute("src")).toBe("https://res.cloudinary.com/demo/video/upload/f_mp4,vc_h264/v1/x/clip.mp4");
  });

  it("plays a linked direct video as a 30-second window from its start time", async () => {
    api.byUser.mockResolvedValue({ media: [item({ type: "video", url: "https://cdn.example.com/a.mp4", startSeconds: 20 })] });
    const { container } = renderGrid(false);
    await screen.findByRole("button", { name: "Add a reaction" });
    expect(container.querySelector("video")!.getAttribute("src")).toBe("https://cdn.example.com/a.mp4#t=20,50");
  });

  it("stops a linked video at the end of its 30-second window", async () => {
    api.byUser.mockResolvedValue({ media: [item({ type: "video", url: "https://cdn.example.com/a.mp4", startSeconds: 0 })] });
    const { container } = renderGrid(false);
    await screen.findByRole("button", { name: "Add a reaction" });
    const el = container.querySelector("video")!;
    const pause = vi.spyOn(el, "pause").mockImplementation(() => {});
    Object.defineProperty(el, "currentTime", { value: 31, writable: true });
    fireEvent.timeUpdate(el);
    expect(pause).toHaveBeenCalled();
    expect(el.currentTime).toBe(30);
  });

  it("embeds a YouTube link clipped to 30 seconds", async () => {
    api.byUser.mockResolvedValue({
      media: [item({ type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", startSeconds: 5 })],
    });
    const { container } = renderGrid(false);
    await screen.findByRole("button", { name: "Add a reaction" });
    const src = container.querySelector("iframe")!.getAttribute("src")!;
    expect(src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?start=5&end=35/);
  });

  it("won't embed a stored link that isn't a valid YouTube video", async () => {
    api.byUser.mockResolvedValue({ media: [item({ type: "embed", url: "https://evil.example.net/x", startSeconds: 0 })] });
    const { container } = renderGrid(false);
    expect(await screen.findByText(/can't be shown/)).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
  });
});

describe("PortfolioGrid: generated pictures", () => {
  it("saves a generated picture to the portfolio, captioned with the prompt and marked as AI", async () => {
    api.create.mockResolvedValue({ mediaItem: item({ id: "gen", isAiImage: true, caption: "a red kite" }) });
    renderGrid(true);
    await userEvent.type(await screen.findByPlaceholderText("Describe an image to generate…"), "  a red kite  ");
    await userEvent.click(screen.getByRole("button", { name: "fake-generate" }));

    expect(api.create).toHaveBeenCalledWith({
      url: "https://cdn.example.com/generated.jpg",
      type: "image",
      caption: "a red kite",
      isAiImage: true,
    });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Add a reaction" })).toHaveLength(3));
  });

  it("truncates a long prompt to the 200-character caption limit instead of losing the picture (regression)", async () => {
    api.create.mockResolvedValue({ mediaItem: item({ id: "gen" }) });
    renderGrid(true);
    const long = "a highly detailed cinematic oil painting of a lighthouse ".repeat(6); // ~340 characters
    await userEvent.click(await screen.findByPlaceholderText("Describe an image to generate…"));
    await userEvent.paste(long);
    await userEvent.click(screen.getByRole("button", { name: "fake-generate" }));

    expect(api.create).toHaveBeenCalledTimes(1);
    const sent = api.create.mock.calls[0][0];
    expect(sent.caption).toHaveLength(200);
    expect(long.startsWith(sent.caption!)).toBe(true);
  });

  it("sends no caption when there is no prompt text", async () => {
    api.create.mockResolvedValue({ mediaItem: item({ id: "gen" }) });
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "fake-generate" }));
    expect(api.create.mock.calls[0][0].caption).toBeUndefined();
  });

  it("shows the server's message if saving the generated picture fails", async () => {
    api.create.mockRejectedValue(new ApiError(400, "Image links must start with https://"));
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "fake-generate" }));
    expect(await screen.findByText("Image links must start with https://")).toBeInTheDocument();
  });
});

describe("PortfolioGrid: adding videos", () => {
  function chooseFile(file: File) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }
  const mp4 = () => new File(["x"], "clip.mp4", { type: "video/mp4" });

  it("uploads a video that passes the length check and adds it to the grid", async () => {
    vi.mocked(checkVideoFile).mockResolvedValue(null);
    upload.mockResolvedValue({ url: "u", mediaItem: item({ id: "new", type: "video", url: "https://x/clip.mp4", durationSeconds: 9 }) });
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    chooseFile(mp4());
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(File), "portfolio", undefined));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Add a reaction" })).toHaveLength(3));
  });

  it("refuses an over-long or over-large video before uploading, with the reason", async () => {
    vi.mocked(checkVideoFile).mockResolvedValue("Videos can be up to 30 seconds — this one is 42 seconds.");
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    chooseFile(mp4());
    expect(await screen.findByText(/this one is 42 seconds/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("shows the server's message if the upload is rejected", async () => {
    vi.mocked(checkVideoFile).mockResolvedValue(null);
    upload.mockRejectedValue(new ApiError(400, "Videos can be up to 30 seconds — this one is 44 seconds"));
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    chooseFile(mp4());
    expect(await screen.findByText(/this one is 44 seconds/)).toBeInTheDocument();
  });

  it("adds a video by link, with an optional start time", async () => {
    api.create.mockResolvedValue({ mediaItem: item({ id: "yt", type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", startSeconds: 12 }) });
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "+ Video link" }));
    await userEvent.type(screen.getByLabelText("Video link"), "https://youtu.be/dQw4w9WgXcQ");
    await userEvent.type(screen.getByLabelText("Start time in seconds"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Add video" }));

    expect(api.create).toHaveBeenCalledWith({ type: "video", url: "https://youtu.be/dQw4w9WgXcQ", startSeconds: 12 });
    await waitFor(() => expect(screen.queryByLabelText("Video link")).not.toBeInTheDocument());
  });

  it("shows the server's message for a bad link and keeps the form open", async () => {
    api.create.mockRejectedValue(new ApiError(400, "Video links must be a YouTube link or a direct .mp4, .webm or .mov file link"));
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "+ Video link" }));
    await userEvent.type(screen.getByLabelText("Video link"), "https://vimeo.com/1");
    await userEvent.click(screen.getByRole("button", { name: "Add video" }));
    expect(await screen.findByText(/YouTube link or a direct/)).toBeInTheDocument();
    expect(screen.getByLabelText("Video link")).toBeInTheDocument();
  });

  it("tells the owner the limits", async () => {
    renderGrid(true);
    expect(await screen.findByText(/up to 30 seconds and 30 MB/)).toBeInTheDocument();
  });
});

describe("PortfolioGrid: captions", () => {
  const LONG = "Harbour at dusk, the last boats coming in while the lamps come on along the quay and the light goes soft over the water";
  const chooseImage = () => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
  };
  const nextBox = () => screen.getByLabelText("Caption for the next piece");

  it("shows a caption in full under its picture, to anyone, and offers a visitor no way to change it", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: LONG })] });
    renderGrid(false);
    expect(await screen.findByText(LONG)).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("alt", LONG);
    expect(screen.queryByRole("button", { name: "Edit caption" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a caption" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Caption for the next piece")).not.toBeInTheDocument();
  });

  it("shows nothing where a piece has no caption, for a visitor", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: null })] });
    renderGrid(false);
    await screen.findByRole("button", { name: "Add a reaction" });
    expect(screen.queryByText(/caption/i)).not.toBeInTheDocument();
  });

  it("offers the owner a way to add one to a piece without it, and to change one that has it", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: null }), item({ id: "m2", caption: "Old words" })] });
    renderGrid(true);
    expect(await screen.findByRole("button", { name: "Add a caption" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit caption" })).toBeInTheDocument();
  });

  it("adds a caption to a piece that had none", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: null })] });
    api.setCaption.mockResolvedValue({ item: item({ id: "m1", caption: "Sunrise" }) });
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "Add a caption" }));
    const box = screen.getByLabelText("Caption");
    expect(box).toHaveAttribute("maxLength", "200");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(); // nothing written yet
    await userEvent.type(box, "  Sunrise ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.setCaption).toHaveBeenCalledWith("m1", "Sunrise");
    expect(await screen.findByText("Sunrise")).toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit caption" })).toBeInTheDocument();
  });

  it("changes a caption, and takes it off by saving it empty", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: "Old words" })] });
    api.setCaption.mockResolvedValueOnce({ item: item({ id: "m1", caption: "New words" }) }).mockResolvedValueOnce({ item: item({ id: "m1", caption: null }) });
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "Edit caption" }));
    const box = screen.getByLabelText("Caption");
    expect(box).toHaveValue("Old words");
    await userEvent.clear(box);
    await userEvent.type(box, "New words");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.setCaption).toHaveBeenLastCalledWith("m1", "New words");
    expect(await screen.findByText("New words")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit caption" }));
    await userEvent.clear(screen.getByLabelText("Caption"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.setCaption).toHaveBeenLastCalledWith("m1", null);
    await waitFor(() => expect(screen.queryByText("New words")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add a caption" })).toBeInTheDocument();
  });

  it("lets the owner change their mind", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: "Keep me" })] });
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "Edit caption" }));
    await userEvent.type(screen.getByLabelText("Caption"), " and more");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.setCaption).not.toHaveBeenCalled();
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
  });

  it("says why a caption couldn't be saved, keeps what was typed, and keeps the old caption", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: "Old words" })] });
    api.setCaption.mockRejectedValue(new ApiError(400, "Caption must be text of 200 characters or fewer"));
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "Edit caption" }));
    await userEvent.type(screen.getByLabelText("Caption"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Caption must be text of 200 characters or fewer");
    expect(screen.getByLabelText("Caption")).toHaveValue("Old words!");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Old words")).toBeInTheDocument();
  });

  it("counts the characters as the owner writes", async () => {
    api.byUser.mockResolvedValue({ media: [item({ id: "m1", caption: "abc" })] });
    renderGrid(true);
    await userEvent.click(await screen.findByRole("button", { name: "Edit caption" }));
    expect(screen.getByText("3/200")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Caption"), "de");
    expect(screen.getByText("5/200")).toBeInTheDocument();
  });

  it("gives an uploaded photo the caption written beforehand, then clears the box for the next one", async () => {
    upload.mockResolvedValue({ url: "u", mediaItem: item({ id: "new", caption: "Studio at dawn" }) });
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    expect(nextBox()).toHaveAttribute("maxLength", "200");
    await userEvent.type(nextBox(), "  Studio at dawn ");
    chooseImage();
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(File), "portfolio", "Studio at dawn"));
    expect(await screen.findByText("Studio at dawn")).toBeInTheDocument();
    expect(nextBox()).toHaveValue("");
  });

  it("uploads without a caption when none was written", async () => {
    upload.mockResolvedValue({ url: "u", mediaItem: item({ id: "new" }) });
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    chooseImage();
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(File), "portfolio", undefined));
  });

  it("keeps the caption written beforehand if the upload fails, so it needn't be typed again", async () => {
    upload.mockRejectedValue(new ApiError(400, "Pictures can be up to 10 MB"));
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    await userEvent.type(nextBox(), "Keep this");
    chooseImage();
    expect(await screen.findByText("Pictures can be up to 10 MB")).toBeInTheDocument();
    expect(nextBox()).toHaveValue("Keep this");
  });

  it("gives a video link, a photo from the search and a generated picture the caption too", async () => {
    api.create.mockImplementation(async (input) => ({ mediaItem: item({ id: "n" + Math.random(), caption: input.caption ?? null }) }));
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });

    await userEvent.type(nextBox(), "From a link");
    await userEvent.click(screen.getByRole("button", { name: "+ Video link" }));
    await userEvent.type(screen.getByLabelText("Video link"), "https://youtu.be/dQw4w9WgXcQ");
    await userEvent.click(screen.getByRole("button", { name: "Add video" }));
    await waitFor(() => expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ type: "video", caption: "From a link" })));
    await waitFor(() => expect(nextBox()).toHaveValue(""));

    await userEvent.type(nextBox(), "Found it");
    await userEvent.click(screen.getByRole("button", { name: "fake-search-pick" }));
    await waitFor(() => expect(api.create).toHaveBeenLastCalledWith({ url: "https://images.example.com/found.jpg", type: "image", caption: "Found it" }));
    await waitFor(() => expect(nextBox()).toHaveValue(""));

    await userEvent.type(nextBox(), "Mine, not the prompt");
    await userEvent.type(screen.getByPlaceholderText("Describe an image to generate…"), "a long description of a harbour");
    await userEvent.click(screen.getByRole("button", { name: "fake-generate" }));
    await waitFor(() => expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ isAiImage: true, caption: "Mine, not the prompt" })));
  });

  it("still uses the prompt as the caption of a generated picture when no caption was written", async () => {
    api.create.mockResolvedValue({ mediaItem: item({ id: "gen" }) });
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Add a reaction" });
    await userEvent.type(screen.getByPlaceholderText("Describe an image to generate…"), "a harbour");
    await userEvent.click(screen.getByRole("button", { name: "fake-generate" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ caption: "a harbour", isAiImage: true })));
  });
});
