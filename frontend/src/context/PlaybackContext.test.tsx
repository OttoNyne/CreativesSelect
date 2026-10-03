import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaybackProvider, usePlayback } from "./PlaybackContext";
import type { Track } from "../types";

const song = (id: string, over: Partial<Track> = {}): Track => ({
  id,
  ownerId: "u1",
  title: `Song ${id}`,
  sourceType: "upload",
  url: `https://res.cloudinary.com/demo/video/upload/v1/tracks/${id}.m4a`,
  position: 0,
  createdAt: "",
  ...over,
});
const video = (id: string): Track => song(id, { sourceType: "youtube", url: "dQw4w9WgXcQ" });

// Every audio element that was asked to play, so we can check there is only ever one.
const players = new Set<HTMLMediaElement>();
let playImpl: () => Promise<void>;
let calledDuringTap = false;
let inTap = false;

function Probe({ queue }: { queue: Track[] }) {
  const ctx = usePlayback();
  return (
    <div>
      <button
        onClick={() => {
          inTap = true;
          ctx.play(queue[0], queue);
          inTap = false;
        }}
      >
        start-first
      </button>
      <button onClick={() => ctx.play(queue[1], queue)}>start-second</button>
      <button onClick={ctx.playNext}>next</button>
      <button onClick={ctx.toggle}>toggle</button>
      <button onClick={ctx.stop}>stop</button>
      <p data-testid="current">{ctx.current?.id ?? "none"}</p>
      <p data-testid="playing">{String(ctx.isPlaying)}</p>
      <p data-testid="error">{ctx.error ?? ""}</p>
    </div>
  );
}
const audioEl = () => [...players][0];
const renderProbe = (queue: Track[]) =>
  render(
    <PlaybackProvider>
      <Probe queue={queue} />
    </PlaybackProvider>
  );

beforeEach(() => {
  players.clear();
  calledDuringTap = false;
  playImpl = () => Promise.resolve();
  HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    players.add(this);
    if (inTap) calledDuringTap = true;
    return playImpl();
  });
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("PlaybackProvider: uploaded songs", () => {
  it("starts the song inside the tap that asked for it (what an iPhone requires)", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    expect(calledDuringTap).toBe(true);
    expect(audioEl().getAttribute("src")).toBe("https://res.cloudinary.com/demo/video/upload/v1/tracks/a.m4a");
    expect(screen.getByTestId("current")).toHaveTextContent("a");
  });

  it("marks the audio element for inline playback", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    expect(audioEl().hasAttribute("playsinline")).toBe(true);
  });

  it("reports playing and paused as the element does", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    act(() => audioEl().dispatchEvent(new Event("play")));
    expect(screen.getByTestId("playing")).toHaveTextContent("true");
    act(() => audioEl().dispatchEvent(new Event("pause")));
    expect(screen.getByTestId("playing")).toHaveTextContent("false");
  });

  it("uses one audio element for every song, so a phone's permission to play carries over", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    await userEvent.click(screen.getByText("start-second"));
    await userEvent.click(screen.getByText("next"));
    expect(players.size).toBe(1);
  });

  it("moves on to the next song when one ends, wrapping round to the first", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    act(() => audioEl().dispatchEvent(new Event("ended")));
    expect(screen.getByTestId("current")).toHaveTextContent("b");
    expect(audioEl().getAttribute("src")).toContain("/b.m4a");
    act(() => audioEl().dispatchEvent(new Event("ended")));
    expect(screen.getByTestId("current")).toHaveTextContent("a");
  });

  it("asks for a tap when the browser refuses to start by itself", async () => {
    playImpl = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    expect(await screen.findByText("Tap play to start the music.")).toBeInTheDocument();
  });

  it("says so when a song can't be played on this device", async () => {
    playImpl = () => Promise.reject(new DOMException("unsupported", "NotSupportedError"));
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    expect(await screen.findByText("This song can't be played on this device.")).toBeInTheDocument();
  });

  it("reports a file the element can't load, but ignores errors once nothing is loaded", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    act(() => audioEl().dispatchEvent(new Event("error")));
    expect(screen.getByTestId("error")).toHaveTextContent("can't be played");
    await userEvent.click(screen.getByText("stop"));
    expect(screen.getByTestId("error")).toHaveTextContent("");
    act(() => audioEl().dispatchEvent(new Event("error")));
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("converts songs Safari can't play to MP3 on the fly", async () => {
    renderProbe([song("a", { url: "https://res.cloudinary.com/demo/video/upload/v1/tracks/a.ogg" }), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    expect(audioEl().getAttribute("src")).toBe("https://res.cloudinary.com/demo/video/upload/f_mp3/v1/tracks/a.mp3");
  });

  it("pauses and resumes with toggle, and does nothing when there's no song", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("toggle")); // nothing loaded: harmless
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("start-first"));
    Object.defineProperty(audioEl(), "paused", { value: false, configurable: true });
    await userEvent.click(screen.getByText("toggle"));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    Object.defineProperty(audioEl(), "paused", { value: true, configurable: true });
    const before = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    await userEvent.click(screen.getByText("toggle"));
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length).toBe(before + 1);
  });

  it("stop silences the song and clears the player", async () => {
    renderProbe([song("a"), song("b")]);
    await userEvent.click(screen.getByText("start-first"));
    await userEvent.click(screen.getByText("stop"));
    expect(screen.getByTestId("current")).toHaveTextContent("none");
    expect(audioEl().hasAttribute("src")).toBe(false);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});

describe("PlaybackProvider: YouTube tracks", () => {
  it("silences any song when a YouTube track starts, leaving playback to the embedded player", async () => {
    renderProbe([song("a"), video("v")]);
    await userEvent.click(screen.getByText("start-first"));
    await userEvent.click(screen.getByText("start-second"));
    expect(screen.getByTestId("current")).toHaveTextContent("v");
    expect(audioEl().hasAttribute("src")).toBe(false);
  });

  it("silences the audio element when the queue moves on to a YouTube track", async () => {
    renderProbe([song("a"), video("v")]);
    await userEvent.click(screen.getByText("start-first"));
    act(() => audioEl().dispatchEvent(new Event("ended")));
    expect(screen.getByTestId("current")).toHaveTextContent("v");
    expect(audioEl().hasAttribute("src")).toBe(false);
  });

  it("never creates an audio element for a queue of only YouTube tracks", async () => {
    renderProbe([video("v1"), video("v2")]);
    await userEvent.click(screen.getByText("start-first"));
    expect(players.size).toBe(0);
  });
});

describe("usePlayback", () => {
  it("must be used inside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe queue={[song("a")]} />)).toThrow(/PlaybackProvider/);
    spy.mockRestore();
  });
});

describe("PlaybackProvider: rearranging the playlist while it plays", () => {
  function Reorder({ queue, reordered }: { queue: Track[]; reordered: Track[] }) {
    const ctx = usePlayback();
    return (
      <div>
        <button onClick={() => ctx.play(queue[0], queue)}>start</button>
        <button onClick={() => ctx.reorderQueue(reordered)}>reorder</button>
        <button onClick={ctx.playNext}>next</button>
        <p data-testid="current">{ctx.current?.id ?? "none"}</p>
        <p data-testid="queue">{ctx.queue.map((t) => t.id).join(",")}</p>
      </div>
    );
  }
  const setup = (queue: Track[], reordered: Track[]) =>
    render(
      <PlaybackProvider>
        <Reorder queue={queue} reordered={reordered} />
      </PlaybackProvider>
    );
  const [a, b, c] = [song("a"), song("b"), song("c")];

  it("what plays next follows the new order, and the current song carries on without a restart", async () => {
    setup([a, b, c], [c, a, b]);
    await userEvent.click(screen.getByText("start"));
    const playCalls = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    await userEvent.click(screen.getByText("reorder"));
    expect(screen.getByTestId("queue")).toHaveTextContent("c,a,b");
    expect(screen.getByTestId("current")).toHaveTextContent("a");
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length).toBe(playCalls); // not restarted
    await userEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("current")).toHaveTextContent("b"); // after a, in the new order
    await userEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("current")).toHaveTextContent("c"); // then wraps to the new first
  });

  it("is ignored when the queue isn't made of exactly those songs (another profile's music, nothing playing)", async () => {
    setup([a, b, c], [c, a]);
    await userEvent.click(screen.getByText("start"));
    await userEvent.click(screen.getByText("reorder"));
    expect(screen.getByTestId("queue")).toHaveTextContent("a,b,c");

    const other = [song("x"), song("y"), song("z")];
    setup([a, b, c], other);
    await userEvent.click(screen.getAllByText("start")[1]);
    await userEvent.click(screen.getAllByText("reorder")[1]);
    expect(screen.getAllByTestId("queue")[1]).toHaveTextContent("a,b,c");
  });

  it("does nothing when nothing is playing", async () => {
    setup([a, b], [b, a]);
    await userEvent.click(screen.getByText("reorder"));
    expect(screen.getByTestId("queue")).toHaveTextContent("");
    expect(screen.getByTestId("current")).toHaveTextContent("none");
  });
});
