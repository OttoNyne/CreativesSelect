// Loads YouTube's official IFrame Player API (the sanctioned embedding
// mechanism — https://developers.google.com/youtube/iframe_api_reference).
// This lets us listen for "ended" on an embedded video and react to it
// (e.g. auto-advance to the next track); it does not download, extract,
// or transcode any audio/video.

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: { events?: Record<string, (event: unknown) => void> }) => YTPlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

let apiReadyPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }
  });
  return apiReadyPromise;
}
