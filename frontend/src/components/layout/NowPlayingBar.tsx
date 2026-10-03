import { useEffect, useRef, useState } from "react";
import { usePlayback } from "../../context/PlaybackContext";
import { loadYouTubeIframeApi, youtubeErrorMessage, type YTPlayer } from "../../lib/youtubeIframeApi";

const YT_ELEMENT_ID = "now-playing-yt-player";

const barButton = "rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10";

export function NowPlayingBar() {
  const { current, playNext, stop, isPlaying, toggle, error } = usePlayback();
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  // YouTube: the browser (iPhones especially) may refuse to start a video by itself; then the person
  // has to tap play. And some videos can't be embedded at all.
  const [needsTap, setNeedsTap] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);

  // (Re)wire the YouTube IFrame API against the current track's embed —
  // official embedded playback, not audio extraction — so "ended" advances
  // the queue. This bar lives above the router outlet, so it isn't
  // unmounted by navigating to another page in the app.
  useEffect(() => {
    setNeedsTap(false);
    setYtError(null);
    if (!current || current.sourceType !== "youtube") return;
    let cancelled = false;

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT || !document.getElementById(YT_ELEMENT_ID)) return;
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = new window.YT.Player(YT_ELEMENT_ID, {
        events: {
          onReady: () => ytPlayerRef.current?.playVideo(),
          onAutoplayBlocked: () => setNeedsTap(true),
          onError: (event) => setYtError(youtubeErrorMessage((event as { data: number }).data)),
          onStateChange: (event) => {
            const state = (event as { data: number }).data;
            if (state === window.YT?.PlayerState.PLAYING) setNeedsTap(false);
            if (state === window.YT?.PlayerState.ENDED) playNext();
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [current, playNext]);

  if (!current) return null;

  const isYouTube = current.sourceType === "youtube";
  const status = isYouTube
    ? ytError ?? (needsTap ? "Tap play to start" : "Playing via YouTube")
    : error ?? (isPlaying ? "Playing" : "Paused");

  return (
    <>
      {isYouTube && (
        // YouTube requires an embedded player to be a visible 200 pixels or more in height, and a phone only
        // lets a person start it by tapping it, so it is shown at a proper size above the bar.
        <div className="fixed bottom-14 left-2 right-2 z-40 mx-auto w-[min(100%-1rem,356px)] sm:left-auto sm:right-4 sm:mx-0">
          <iframe
            key={current.id}
            id={YT_ELEMENT_ID}
            src={`https://www.youtube.com/embed/${current.url}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
            title={current.title}
            className="block h-[200px] w-full rounded-lg border border-white/10 bg-black"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
          {ytError && (
            <a
              href={`https://www.youtube.com/watch?v=${current.url}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block rounded-md bg-black/80 px-2 py-1 text-center text-xs text-violet-300 hover:underline"
            >
              Open on YouTube
            </a>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0e0e12]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          {!isYouTube && (
            <button
              onClick={toggle}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-500"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{current.title}</p>
            <p role="status" className={`truncate text-xs ${ytError || error ? "text-amber-300" : "text-white/40"}`}>
              {status}
            </p>
          </div>

          <button onClick={playNext} className={barButton}>
            Skip ⏭
          </button>
          <button onClick={stop} aria-label="Stop" className={barButton}>
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
