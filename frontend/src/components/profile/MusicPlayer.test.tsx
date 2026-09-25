import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MusicPlayer } from "./MusicPlayer";
import { tracksApi } from "../../api/tracks.api";
import { uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import { usePlayback } from "../../context/PlaybackContext";
import type { Track } from "../../types";

vi.mock("../../api/tracks.api", () => ({ tracksApi: { byUser: vi.fn(), add: vi.fn(), remove: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../context/PlaybackContext", () => ({ usePlayback: vi.fn() }));
const api = vi.mocked(tracksApi);
const play = vi.fn();

function track(over: Partial<Track> = {}): Track {
  return { id: "t1", ownerId: "me", title: "Song one", sourceType: "youtube", url: "dQw4w9WgXcQ", position: 0, createdAt: "", ...over } as Track;
}

function renderPlayer(isOwner: boolean, current: Track | null = null) {
  vi.mocked(usePlayback).mockReturnValue({ current, play } as never);
  return render(<MusicPlayer username="me" isOwner={isOwner} />);
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(uploadFile).mockReset();
  play.mockReset();
  api.byUser.mockResolvedValue({ tracks: [track(), track({ id: "t2", title: "Upload two", sourceType: "upload" })] });
});

describe("MusicPlayer", () => {
  it("lists tracks with their source and the count out of 5", async () => {
    renderPlayer(false);
    expect(await screen.findByText("Song one")).toBeInTheDocument();
    expect(screen.getByText("Upload two")).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  it("says so when there are no tracks", async () => {
    api.byUser.mockResolvedValue({ tracks: [] });
    renderPlayer(false);
    expect(await screen.findByText("No tracks yet.")).toBeInTheDocument();
  });

  it("shows the empty state, not a stuck 'Loading…', when the tracks can't be loaded (private profile)", async () => {
    api.byUser.mockRejectedValue(new ApiError(403, "This profile is private"));
    renderPlayer(false);
    expect(await screen.findByText("No tracks yet.")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("plays a track with the whole queue", async () => {
    renderPlayer(false);
    await userEvent.click((await screen.findAllByTitle("Play"))[0]);
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), expect.arrayContaining([expect.objectContaining({ id: "t2" })]));
  });

  it("marks the track that's currently playing", async () => {
    renderPlayer(false, track());
    expect(await screen.findByTitle("Playing")).toBeInTheDocument();
  });

  it("gives visitors no editing controls", async () => {
    renderPlayer(false);
    await screen.findByText("Song one");
    expect(screen.queryByPlaceholderText("Paste a YouTube link…")).not.toBeInTheDocument();
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });

  it("adds a YouTube track, using a default title if none is typed", async () => {
    api.add.mockResolvedValue({ track: track({ id: "t3", title: "Untitled track", position: 2 }) });
    renderPlayer(true);
    await userEvent.type(await screen.findByPlaceholderText("Paste a YouTube link…"), " https://youtu.be/dQw4w9WgXcQ ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(api.add).toHaveBeenCalledWith({ title: "Untitled track", sourceType: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(await screen.findByText("Untitled track")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste a YouTube link…")).toHaveValue("");
  });

  it("shows the server's message for a bad link", async () => {
    api.add.mockRejectedValue(new ApiError(400, "Invalid YouTube URL"));
    renderPlayer(true);
    await userEvent.type(await screen.findByPlaceholderText("Paste a YouTube link…"), "nonsense");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Invalid YouTube URL")).toBeInTheDocument();
  });

  it("uploads a song and adds it, titled from the caption or the file name", async () => {
    vi.mocked(uploadFile).mockResolvedValue({ url: "https://cdn.example.com/song.mp3" });
    api.add.mockResolvedValue({ track: track({ id: "t3", title: "my-demo", sourceType: "upload", position: 2 }) });
    renderPlayer(true);
    await screen.findByText("Song one");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "my-demo.mp3", { type: "audio/mpeg" })] } });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "tracks"));
    await waitFor(() => expect(api.add).toHaveBeenCalledWith({ title: "my-demo", sourceType: "upload", url: "https://cdn.example.com/song.mp3" }));
    expect(await screen.findByText("my-demo")).toBeInTheDocument();
  });

  it("shows the server's message if an upload fails", async () => {
    vi.mocked(uploadFile).mockRejectedValue(new ApiError(413, "File exceeds the 30MB upload limit"));
    renderPlayer(true);
    await screen.findByText("Song one");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "big.mp3", { type: "audio/mpeg" })] } });
    expect(await screen.findByText("File exceeds the 30MB upload limit")).toBeInTheDocument();
  });

  it("removes a track", async () => {
    api.remove.mockResolvedValue(undefined);
    renderPlayer(true);
    await userEvent.click((await screen.findAllByText("✕"))[0]);
    expect(api.remove).toHaveBeenCalledWith("t1");
    await waitFor(() => expect(screen.queryByText("Song one")).not.toBeInTheDocument());
  });

  it("stops offering to add once the 5-track limit is reached", async () => {
    api.byUser.mockResolvedValue({ tracks: [1, 2, 3, 4, 5].map((n) => track({ id: `t${n}`, title: `Song ${n}` })) });
    renderPlayer(true);
    expect(await screen.findByText("Remove a track to add another.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Paste a YouTube link…")).not.toBeInTheDocument();
  });
});
