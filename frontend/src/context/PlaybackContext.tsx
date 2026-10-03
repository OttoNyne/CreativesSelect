import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Track } from "../types";
import { playableAudioUrl } from "../lib/audioUrl";

interface PlaybackContextValue {
  current: Track | null;
  queue: Track[];
  /** Start (or resume) a track, remembering the rest of its list so playback
   *  can continue through the queue — this state lives above the router
   *  outlet, so it survives navigating to another page in the app. */
  play: (track: Track, queue: Track[]) => void;
  playNext: () => void;
  stop: () => void;
  /** Whether an uploaded song is playing right now (YouTube tracks report their own state). */
  isPlaying: boolean;
  /** Pause or resume an uploaded song. */
  toggle: () => void;
  /** Why the current uploaded song isn't playing, if it isn't. */
  error: string | null;
}

const PlaybackContext = createContext<PlaybackContextValue | undefined>(undefined);

const BLOCKED = "Tap play to start the music.";
const CANT_PLAY = "This song can't be played on this device.";

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<Track[]>([]);
  const currentRef = useRef<Track | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playNextRef = useRef<() => void>(() => {});

  // One audio element for the whole app, created the first time it's needed. iPhones only let a page
  // start sound from a tap, and then keep allowing that same element to play more (the next song in
  // the queue) — so the element must outlive any one song, and play() must be called from the tap itself.
  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => setIsPlaying(false));
    audio.addEventListener("ended", () => playNextRef.current());
    audio.addEventListener("error", () => {
      if (audio.getAttribute("src")) {
        setIsPlaying(false);
        setError(CANT_PLAY);
      }
    });
    audioRef.current = audio;
    return audio;
  }, []);

  const startUpload = useCallback(
    (track: Track) => {
      const audio = getAudio();
      setError(null);
      const src = playableAudioUrl(track.url);
      if (!src) return setError(CANT_PLAY);
      audio.src = src;
      const started = audio.play();
      started?.catch((err: unknown) => {
        // NotAllowedError: the browser wants a tap first (e.g. a song that starts by itself after a video)
        setError(err instanceof DOMException && err.name === "NotAllowedError" ? BLOCKED : CANT_PLAY);
      });
    },
    [getAudio]
  );

  const silenceAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    (track: Track, nextQueue: Track[]) => {
      queueRef.current = nextQueue;
      currentRef.current = track;
      setQueue(nextQueue);
      setCurrent(track);
      setError(null);
      // Started right here, inside the tap that called us.
      if (track.sourceType === "upload") startUpload(track);
      else silenceAudio();
    },
    [startUpload, silenceAudio]
  );

  const playNext = useCallback(() => {
    const list = queueRef.current;
    const prev = currentRef.current;
    if (!prev || list.length === 0) return;
    const index = list.findIndex((t) => t.id === prev.id);
    if (index === -1) return;
    const next = list[(index + 1) % list.length];
    currentRef.current = next;
    setCurrent(next);
    setError(null);
    if (next.sourceType === "upload") startUpload(next);
    else silenceAudio();
  }, [startUpload, silenceAudio]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const stop = useCallback(() => {
    queueRef.current = [];
    currentRef.current = null;
    setQueue([]);
    setCurrent(null);
    setError(null);
    silenceAudio();
  }, [silenceAudio]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute("src")) return;
    if (audio.paused) {
      setError(null);
      audio.play()?.catch(() => setError(CANT_PLAY));
    } else {
      audio.pause();
    }
  }, []);

  const value = useMemo(
    () => ({ current, queue, play, playNext, stop, isPlaying, toggle, error }),
    [current, queue, play, playNext, stop, isPlaying, toggle, error]
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
}
