import { useEffect } from "react";
import { activityApi } from "../../api/activity.api";
import { useAuth } from "../../context/AuthContext";

export const PING_INTERVAL_MS = 2 * 60 * 1000;

/** Renders nothing. While a signed-in person has the site open and visible it checks in about every two minutes, which is what
 *  "Online now" is made of. A hidden tab doesn't check in, and nothing is sent for someone who has turned the feature off. */
export function ActivityPing() {
  const { user } = useAuth();
  const enabled = Boolean(user) && user?.showActivity !== false;

  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      if (document.visibilityState === "hidden") return;
      activityApi.ping().catch(() => {}); // a missed check-in just means a slightly older "last active"
    };
    ping();
    const timer = setInterval(ping, PING_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [enabled]);

  return null;
}
