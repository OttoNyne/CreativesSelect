import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioGrid } from "./PortfolioGrid";
import { mediaApi, uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { checkVideoFile } from "../../lib/video";
import type { MediaItem } from "../../types";

vi.mock("../../api/media.api", () => ({
  mediaApi: { byUser: vi.fn(), create: vi.fn(), remove: vi.fn(), react: vi.fn() },
  uploadFile: vi.fn(),
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
vi.mock("../ai/ImageSearchPicker", () => ({ ImageSearchPicker: () => <div>search</div> }));
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
    likes: 0,
    dislikes: 0,
    myReaction: 0,
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
    await screen.findAllByRole("button", { name: "Like" });
    expect(screen.queryByRole("button", { name: "Remove from portfolio" })).not.toBeInTheDocument();
  });
});

describe("PortfolioGrid: likes and dislikes", () => {
  it("likes a picture, then un-likes it by clicking again", async () => {
    api.react.mockResolvedValueOnce({ likes: 1, dislikes: 0, myReaction: 1 }).mockResolvedValueOnce({ likes: 0, dislikes: 0, myReaction: 0 });
    renderGrid(false);
    const like = (await screen.findAllByRole("button", { name: "Like" }))[0];

    await userEvent.click(like);
    expect(api.react).toHaveBeenLastCalledWith("m1", 1);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Like" })[0]).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getAllByRole("button", { name: "Like" })[0]).toHaveTextContent("1");

    await userEvent.click(screen.getAllByRole("button", { name: "Like" })[0]);
    expect(api.react).toHaveBeenLastCalledWith("m1", 0);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Like" })[0]).toHaveAttribute("aria-pressed", "false"));
  });

  it("switches a like to a dislike", async () => {
    api.byUser.mockResolvedValue({ media: [item({ likes: 1, myReaction: 1 })] });
    api.react.mockResolvedValue({ likes: 0, dislikes: 1, myReaction: -1 });
    renderGrid(false);
    await userEvent.click(await screen.findByRole("button", { name: "Dislike" }));
    expect(api.react).toHaveBeenCalledWith("m1", -1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Dislike" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Like" })).toHaveTextContent("0");
  });

  it("shows the counts to everyone but only lets signed-in people react", async () => {
    api.byUser.mockResolvedValue({ media: [item({ likes: 4, dislikes: 2 })] });
    renderGrid(false, false);
    const like = await screen.findByRole("button", { name: "Like" });
    expect(like).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: "Dislike" })).toHaveTextContent("2");
    expect(like).toBeDisabled();
    expect(like).toHaveAttribute("title", "Log in to react");
  });

  it("shows the server's message if reacting fails", async () => {
    api.react.mockRejectedValue(new ApiError(429, "You're reacting too fast — try again in a bit"));
    renderGrid(false);
    await userEvent.click((await screen.findAllByRole("button", { name: "Like" }))[0]);
    expect(await screen.findByText(/reacting too fast/)).toBeInTheDocument();
  });
});

describe("PortfolioGrid: videos", () => {
  it("plays an uploaded video with controls, inline on phones", async () => {
    api.byUser.mockResolvedValue({
      media: [item({ type: "video", url: "https://res.cloudinary.com/demo/video/upload/v1/x/clip.mov", durationSeconds: 12 })],
    });
    const { container } = renderGrid(false);
    await screen.findByRole("button", { name: "Like" });
    const el = container.querySelector("video")!;
    expect(el).toHaveAttribute("controls");
    expect(el).toHaveAttribute("playsinline");
    expect(el.getAttribute("src")).toBe("https://res.cloudinary.com/demo/video/upload/f_mp4,vc_h264/v1/x/clip.mp4");
  });

  it("plays a linked direct video as a 30-second window from its start time", async () => {
    api.byUser.mockResolvedValue({ media: [item({ type: "video", url: "https://cdn.example.com/a.mp4", startSeconds: 20 })] });
    const { container } = renderGrid(false);
    await screen.findByRole("button", { name: "Like" });
    expect(container.querySelector("video")!.getAttribute("src")).toBe("https://cdn.example.com/a.mp4#t=20,50");
  });

  it("stops a linked video at the end of its 30-second window", async () => {
    api.byUser.mockResolvedValue({ media: [item({ type: "video", url: "https://cdn.example.com/a.mp4", startSeconds: 0 })] });
    const { container } = renderGrid(false);
    await screen.findByRole("button", { name: "Like" });
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
    await screen.findByRole("button", { name: "Like" });
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
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Like" })).toHaveLength(3));
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
    await screen.findAllByRole("button", { name: "Like" });
    chooseFile(mp4());
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(File), "portfolio"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Like" })).toHaveLength(3));
  });

  it("refuses an over-long or over-large video before uploading, with the reason", async () => {
    vi.mocked(checkVideoFile).mockResolvedValue("Videos can be up to 30 seconds — this one is 42 seconds.");
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Like" });
    chooseFile(mp4());
    expect(await screen.findByText(/this one is 42 seconds/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("shows the server's message if the upload is rejected", async () => {
    vi.mocked(checkVideoFile).mockResolvedValue(null);
    upload.mockRejectedValue(new ApiError(400, "Videos can be up to 30 seconds — this one is 44 seconds"));
    renderGrid(true);
    await screen.findAllByRole("button", { name: "Like" });
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
