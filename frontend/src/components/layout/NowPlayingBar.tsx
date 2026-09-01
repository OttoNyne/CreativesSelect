import { useEffect, useRef } from "react";
import { usePlayback } from "../../context/PlaybackContext";
import { assetUrl } from "../../api/client";
import { loadYouTubeIframeApi, type YTPlayer } from "../../lib/youtubeIframeApi";

const YT_ELEMENT_ID = "now-playing-yt-player";

export function NowPlayingBar() {
  const { current, playNext, stop } = usePlayback();
  const ytPlayerRef = useRef<YTPlayer | null>(null);

  // (Re)wire the YouTube IFrame API against the current track's embed —
  // official embedded playback, not audio extraction — so "ended" advances
  // the queue. This bar lives above the router outlet, so it isn't
  // unmounted by navigating to another page in the app.
  useEffect(() => {
    if (!current || current.sourceType !== "youtube") return;
    let cancelled = false;

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT || !document.getElementById(YT_ELEMENT_ID)) return;
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = new window.YT.Player(YT_ELEMENT_ID, {
        events: {
          onStateChange: (event) => {
            const state = (event as { data: number }).data;
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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0e0e12]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        {current.sourceType === "youtube" ? (
          <iframe
            key={current.id}
            id={YT_ELEMENT_ID}
            src={`https://www.youtube.com/embed/${current.url}?enablejsapi=1&autoplay=1`}
            title={current.title}
            className="h-14 w-24 shrink-0 rounded"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        ) : (
          <audio
            key={current.id}
            autoPlay
            controls
            src={assetUrl(current.url)}
            onEnded={playNext}
            className="h-10 max-w-[280px] flex-1 sm:flex-none"
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{current.title}</p>
          <p className="text-xs text-white/40">{current.sourceType === "youtube" ? "Playing via YouTube" : "Playing"}</p>
        </div>

        <button
          onClick={playNext}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
        >
          Skip ⏭
        </button>
        <button onClick={stop} className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10">
          ✕
        </button>
      </div>
    </div>
  );
}
