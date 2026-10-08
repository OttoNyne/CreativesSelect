import { useEffect, useRef, useState } from "react";
import { usePlayback } from "../../context/PlaybackContext";
import { loadYouTubeIframeApi, youtubeErrorMessage, type YTPlayer } from "../../lib/youtubeIframeApi";
import { t } from "../../i18n";

const YT_ELEMENT_ID = "now-playing-yt-player";

const barButton = "whitespace-nowrap rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10";

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
    ? ytError ?? (needsTap ? t("media.tapPlay") : t("media.playingYouTube"))
    : error ?? (isPlaying ? t("media.playing") : t("media.paused"));

  // YouTube requires an embedded player to be visible and at least 200 pixels high, and a phone only lets a person start it by tapping
  // it, so it can't shrink into a thin bar. A video is therefore one small card in the corner: the video at its smallest allowed size
  // (224 x 200) with the title and the buttons beside it, and nothing across the bottom of the page. A song that was uploaded has no
  // video, so it keeps the thin bar.
  if (isYouTube) {
    return (
      <div className="fixed bottom-2 end-2 z-40 flex w-[min(340px,calc(100vw-1rem))] overflow-hidden rounded-xl border border-white/15 bg-[#0e0e12]/95 shadow-lg backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-2.5">
          <div className="min-w-0">
            <p className="line-clamp-4 break-words text-sm font-medium text-white">{current.title}</p>
            <p role="status" className={`mt-1 break-words text-xs ${ytError ? "text-amber-300" : "text-white/60"}`}>
              {status}
            </p>
            {ytError && (
              <a href={`https://www.youtube.com/watch?v=${current.url}`} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-violet-300 hover:underline">
                {t("media.openOnYoutube")}
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={playNext} className={barButton}>
              {t("media.skip")}
            </button>
            <button onClick={stop} aria-label={t("media.stop")} className={barButton}>
              ✕
            </button>
          </div>
        </div>
        <iframe
          key={current.id}
          id={YT_ELEMENT_ID}
          src={`https://www.youtube.com/embed/${current.url}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
          title={current.title}
          className="block h-[200px] w-[224px] shrink-0 bg-black"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-0 start-0 end-0 z-40 border-t border-white/10 bg-[#0e0e12]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <button
            onClick={toggle}
            aria-label={isPlaying ? t("media.pause") : t("media.play")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-500"
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{current.title}</p>
            <p role="status" className={`truncate text-xs ${error ? "text-amber-300" : "text-white/60"}`}>
              {status}
            </p>
          </div>

          <button onClick={playNext} className={barButton}>
            {t("media.skip")}
          </button>
          <button onClick={stop} aria-label={t("media.stop")} className={barButton}>
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
