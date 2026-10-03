import { useCallback, useEffect, useRef, useState } from "react";
import { liveApi } from "../../api/live.api";
import type { LiveStage } from "../../types";

/** How often a room asks who is on stage. The server answers from a short-lived cache, so this is cheap even in a full room. */
export const STAGE_POLL_MS = 4_000;

/**
 * The stage of a live, kept fresh. `enabled` is false for lives without a stage (browser-to-browser ones), which never
 * ask. `refresh` fetches straight away (after the person does something) instead of waiting for the next poll.
 */
export function useStage(liveId: string, enabled: boolean, pollMs = STAGE_POLL_MS) {
  const [stage, setStage] = useState<LiveStage | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await liveApi.stage(liveId);
      if (alive.current) setStage(next.enabled ? next : null);
    } catch {
      // a failed poll just tries again next time
    }
  }, [liveId]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [enabled, refresh, pollMs]);

  return { stage, refresh };
}
