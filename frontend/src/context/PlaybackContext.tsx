import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Track } from "../types";

interface PlaybackContextValue {
  current: Track | null;
  queue: Track[];
  /** Start (or resume) a track, remembering the rest of its list so playback
   *  can continue through the queue — this state lives above the router
   *  outlet, so it survives navigating to another page in the app. */
  play: (track: Track, queue: Track[]) => void;
  playNext: () => void;
  stop: () => void;
}

const PlaybackContext = createContext<PlaybackContextValue | undefined>(undefined);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const currentRef = useRef<Track | null>(null);

  const play = useCallback((track: Track, nextQueue: Track[]) => {
    queueRef.current = nextQueue;
    currentRef.current = track;
    setQueue(nextQueue);
    setCurrent(track);
  }, []);

  const playNext = useCallback(() => {
    const list = queueRef.current;
    const prev = currentRef.current;
    if (!prev || list.length === 0) return;
    const index = list.findIndex((t) => t.id === prev.id);
    if (index === -1) return;
    const next = list[(index + 1) % list.length];
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    currentRef.current = null;
    setQueue([]);
    setCurrent(null);
  }, []);

  const value = useMemo(() => ({ current, queue, play, playNext, stop }), [current, queue, play, playNext, stop]);

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
}
