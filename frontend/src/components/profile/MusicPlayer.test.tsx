import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MusicPlayer } from "./MusicPlayer";
import { tracksApi } from "../../api/tracks.api";
import { uploadFile } from "../../api/media.api";
import { ApiError } from "../../api/client";
import { usePlayback } from "../../context/PlaybackContext";
import type { Track } from "../../types";

// (the real limits come through, so the tests say the same numbers as the screen)
vi.mock("../../api/tracks.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/tracks.api")>()),
  tracksApi: { byUser: vi.fn(), add: vi.fn(), remove: vi.fn(), reorder: vi.fn(), update: vi.fn() },
}));
vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../context/PlaybackContext", () => ({ usePlayback: vi.fn() }));
const api = vi.mocked(tracksApi);
const play = vi.fn();
const reorderQueue = vi.fn();

function track(over: Partial<Track> = {}): Track {
  return { id: "t1", ownerId: "me", title: "Song one", sourceType: "youtube", url: "dQw4w9WgXcQ", position: 0, createdAt: "", ...over } as Track;
}

function renderPlayer(isOwner: boolean, current: Track | null = null) {
  vi.mocked(usePlayback).mockReturnValue({ current, play, reorderQueue } as never);
  return render(<MusicPlayer username="me" isOwner={isOwner} />);
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(uploadFile).mockReset();
  play.mockReset();
  reorderQueue.mockReset();
  api.byUser.mockResolvedValue({ tracks: [track(), track({ id: "t2", title: "Upload two", sourceType: "upload" })] });
});

describe("MusicPlayer", () => {
  it("lists tracks with their source and the count out of 20", async () => {
    renderPlayer(false);
    expect(await screen.findByText("Song one")).toBeInTheDocument();
    expect(screen.getByText("Upload two")).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    expect(screen.getByText("2/20")).toBeInTheDocument();
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

  it("stops offering to add once the 20-track limit is reached", async () => {
    api.byUser.mockResolvedValue({ tracks: Array.from({ length: 20 }, (_, i) => track({ id: `t${i}`, title: `Song ${i}` })) });
    renderPlayer(true);
    expect(await screen.findByText("Remove a track to add another.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Paste a YouTube link…")).not.toBeInTheDocument();
  });
});

describe("MusicPlayer: rearranging the playlist", () => {
  const three = () => [track({ id: "t1", title: "One" }), track({ id: "t2", title: "Two" }), track({ id: "t3", title: "Three" })];
  const titles = () => screen.getAllByTestId("track-row").map((row) => row.querySelector("p.truncate")?.textContent);
  const saved = (tracks: Track[]) => api.reorder.mockImplementation(async (ids: string[]) => ({ tracks: ids.map((id, position) => ({ ...tracks.find((t) => t.id === id)!, position })) }));

  beforeEach(() => api.byUser.mockResolvedValue({ tracks: three() }));

  it("offers the owner a way to move each song up or down, but not off either end", async () => {
    renderPlayer(true);
    await screen.findByText("Two");
    expect(screen.getByRole("button", { name: "Move One up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move One down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Two up" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Three down" })).toBeDisabled();
  });

  it("gives visitors no way to rearrange, and nothing to drag", async () => {
    renderPlayer(false);
    await screen.findByText("Two");
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
    for (const row of screen.getAllByTestId("track-row")) expect(row).not.toHaveAttribute("draggable", "true");
  });

  it("has nothing to rearrange with one song", async () => {
    api.byUser.mockResolvedValue({ tracks: [track({ id: "t1", title: "Only" })] });
    renderPlayer(true);
    await screen.findByText("Only");
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
  });

  it("moves a song down, shows it at once, saves the whole order, and keeps the queue in step", async () => {
    saved(three());
    renderPlayer(true);
    await screen.findByText("Two");
    await userEvent.click(screen.getByRole("button", { name: "Move One down" }));
    expect(titles()).toEqual(["Two", "One", "Three"]);
    expect(api.reorder).toHaveBeenCalledWith(["t2", "t1", "t3"]);
    await waitFor(() => expect(reorderQueue).toHaveBeenCalled());
    expect(reorderQueue.mock.calls[0][0].map((t: Track) => t.id)).toEqual(["t2", "t1", "t3"]);
    expect(screen.getByText("Moved One to position 2 of 3.")).toBeInTheDocument();
  });

  it("moves a song up", async () => {
    saved(three());
    renderPlayer(true);
    await screen.findByText("Two");
    await userEvent.click(screen.getByRole("button", { name: "Move Three up" }));
    expect(titles()).toEqual(["One", "Three", "Two"]);
    expect(api.reorder).toHaveBeenCalledWith(["t1", "t3", "t2"]);
  });

  it("goes back to the old order and says so if the order can't be saved", async () => {
    api.reorder.mockRejectedValue(new ApiError(500, "boom"));
    renderPlayer(true);
    await screen.findByText("Two");
    await userEvent.click(screen.getByRole("button", { name: "Move One down" }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(titles()).toEqual(["One", "Two", "Three"]);
    expect(reorderQueue).not.toHaveBeenCalled();
  });

  it("holds the buttons while an order is being saved, so two moves can't cross", async () => {
    let finish: (v: { tracks: Track[] }) => void = () => {};
    api.reorder.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderPlayer(true);
    await screen.findByText("Two");
    await userEvent.click(screen.getByRole("button", { name: "Move One down" }));
    expect(screen.getByRole("button", { name: "Move Two down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Three up" })).toBeDisabled();
    finish({ tracks: [track({ id: "t2", title: "Two" }), track({ id: "t1", title: "One" }), track({ id: "t3", title: "Three" })] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Move Two down" })).toBeEnabled());
  });

  it("can also be rearranged by dragging a song onto another's place", async () => {
    saved(three());
    renderPlayer(true);
    await screen.findByText("Two");
    const rows = screen.getAllByTestId("track-row");
    expect(rows[0]).toHaveAttribute("draggable", "true");
    const data = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(rows[0], { dataTransfer: data });
    fireEvent.dragOver(rows[2], { dataTransfer: data });
    fireEvent.drop(rows[2], { dataTransfer: data });
    expect(titles()).toEqual(["Two", "Three", "One"]);
    expect(api.reorder).toHaveBeenCalledWith(["t2", "t3", "t1"]);
  });

  it("ignores a drop that isn't from one of its own songs, or onto the same place", async () => {
    renderPlayer(true);
    await screen.findByText("Two");
    const rows = screen.getAllByTestId("track-row");
    fireEvent.drop(rows[1]); // something dragged in from elsewhere
    const data = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(rows[1], { dataTransfer: data });
    fireEvent.drop(rows[1], { dataTransfer: data });
    expect(api.reorder).not.toHaveBeenCalled();
    expect(titles()).toEqual(["One", "Two", "Three"]);
  });

  it("keeps removing and playing working alongside", async () => {
    api.remove.mockResolvedValue(undefined);
    renderPlayer(true);
    await screen.findByText("Two");
    await userEvent.click(screen.getByRole("button", { name: "Remove Two" }));
    await waitFor(() => expect(screen.queryByText("Two")).not.toBeInTheDocument());
    expect(api.remove).toHaveBeenCalledWith("t2");
  });
});

describe("MusicPlayer: artists, plays, the profile song and the upload limit", () => {
  const withMore = () =>
    api.byUser.mockResolvedValue({
      tracks: [
        track({ id: "t1", title: "One", artist: "The Band", plays: 12 }),
        track({ id: "t2", title: "Two", plays: 1, profileSong: true }),
        track({ id: "t3", title: "Three", sourceType: "upload" }),
      ],
    });

  it("shows who made a song and how often it was played, and marks the profile song, for everyone", async () => {
    withMore();
    renderPlayer(false);
    expect(await screen.findByText("The Band · YouTube · 12 plays")).toBeInTheDocument();
    expect(screen.getByText("YouTube · 1 play")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument(); // no plays yet: nothing said
    expect(screen.getByText("Profile song")).toBeInTheDocument();
  });

  it("offers a button for the profile song that plays it with the whole queue, and never starts it by itself", async () => {
    withMore();
    renderPlayer(false);
    await screen.findByText("One");
    expect(play).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "▶ Play profile song: Two" }));
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }), expect.arrayContaining([expect.objectContaining({ id: "t1" })]));
  });

  it("has no such button when there is no profile song", async () => {
    renderPlayer(false);
    await screen.findByText("Song one");
    expect(screen.queryByRole("button", { name: /Play profile song/ })).not.toBeInTheDocument();
  });

  it("lets the owner choose the profile song, moves the mark to another, and takes it away", async () => {
    withMore();
    api.update.mockResolvedValue({ track: track() });
    renderPlayer(true);
    await screen.findByText("One");
    expect(screen.getByRole("button", { name: "Stop Two being the profile song" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Make One the profile song" }));
    expect(api.update).toHaveBeenLastCalledWith("t1", { profileSong: true });
    expect(await screen.findByRole("button", { name: "Stop One being the profile song" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make Two the profile song" })).toBeInTheDocument(); // only one at a time
    expect(screen.getAllByText("Profile song")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Stop One being the profile song" }));
    expect(api.update).toHaveBeenLastCalledWith("t1", { profileSong: false });
    await waitFor(() => expect(screen.queryByText("Profile song")).not.toBeInTheDocument());
  });

  it("shows the server's message if the profile song can't be changed", async () => {
    withMore();
    api.update.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPlayer(true);
    await userEvent.click(await screen.findByRole("button", { name: "Make One the profile song" }));
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop Two being the profile song" })).toBeInTheDocument();
  });

  it("gives visitors no way to change anything", async () => {
    withMore();
    renderPlayer(false);
    await screen.findByText("One");
    expect(screen.queryByRole("button", { name: /profile song$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
  });

  it("lets the owner change a song's title and artist", async () => {
    withMore();
    api.update.mockResolvedValue({ track: track({ id: "t1", title: "One, remastered", artist: "New Band" }) });
    renderPlayer(true);
    await userEvent.click(await screen.findByRole("button", { name: "Edit One" }));
    const title = screen.getByLabelText("Track title");
    expect(title).toHaveValue("One");
    expect(screen.getByLabelText("Artist")).toHaveValue("The Band");
    await userEvent.clear(title);
    await userEvent.type(title, "One, remastered");
    await userEvent.clear(screen.getByLabelText("Artist"));
    await userEvent.type(screen.getByLabelText("Artist"), "New Band");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.update).toHaveBeenCalledWith("t1", { title: "One, remastered", artist: "New Band" });
    expect(await screen.findByText(/One, remastered/)).toBeInTheDocument();
    expect(screen.getByText(/New Band/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Track title")).not.toBeInTheDocument();
  });

  it("needs a title, shows the server's reason, and can be cancelled", async () => {
    withMore();
    api.update.mockRejectedValue(new ApiError(429, "You've changed a lot of things — try again later."));
    renderPlayer(true);
    await userEvent.click(await screen.findByRole("button", { name: "Edit One" }));
    await userEvent.clear(screen.getByLabelText("Track title"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("A track needs a title")).toBeInTheDocument();
    expect(api.update).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Track title"), "Back");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/try again later/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Track title")).not.toBeInTheDocument();
    expect(screen.getByText("One")).toBeInTheDocument();
  });

  it("adds a song with its artist when one is typed", async () => {
    api.add.mockResolvedValue({ track: track({ id: "t9", title: "New", artist: "Them" }) });
    renderPlayer(true);
    await userEvent.type(await screen.findByLabelText("Artist (optional)"), " Them ");
    await userEvent.type(screen.getByPlaceholderText("Track title"), "New");
    await userEvent.type(screen.getByPlaceholderText("Paste a YouTube link…"), "https://youtu.be/dQw4w9WgXcQ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(api.add).toHaveBeenCalledWith({ title: "New", sourceType: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", artist: "Them" });
    expect(screen.getByLabelText("Artist (optional)")).toHaveValue("");
  });

  it("stops offering uploads at five uploaded songs but still takes YouTube links", async () => {
    api.byUser.mockResolvedValue({ tracks: Array.from({ length: 5 }, (_, i) => track({ id: `u${i}`, title: `Upload ${i}`, sourceType: "upload" })) });
    renderPlayer(true);
    expect(await screen.findByText(/5\/5 used/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload a song/ })).toBeDisabled();
    expect(screen.getByPlaceholderText("Paste a YouTube link…")).toBeInTheDocument();
  });

  it("says how many uploads are left", async () => {
    renderPlayer(true);
    expect(await screen.findByText(/1\/5 used/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload a song/ })).toBeEnabled();
  });
});
