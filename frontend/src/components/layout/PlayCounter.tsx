import { useEffect } from "react";
import { tracksApi } from "../../api/tracks.api";
import { useAuth } from "../../context/AuthContext";
import { usePlayback } from "../../context/PlaybackContext";

/** How long someone has to stay on a song before it counts as a play, so skipping past a song doesn't count. */
export const COUNT_AFTER_MS = 10_000;

/** Renders nothing. When a signed-in person has stayed on someone else's song for a few seconds it tells the server, which counts it
 *  once a day per listener. Your own songs aren't counted, and nothing is sent for people who aren't signed in. */
export function PlayCounter() {
  const { user } = useAuth();
  const { current } = usePlayback();
  const trackId = current?.id ?? null;
  const ownerId = current?.ownerId ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!trackId || !userId || ownerId === userId) return;
    const timer = setTimeout(() => {
      tracksApi.played(trackId).catch(() => {}); // a missed count is just a missed count
    }, COUNT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [trackId, ownerId, userId]);

  return null;
}
