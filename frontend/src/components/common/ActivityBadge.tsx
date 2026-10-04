import type { Activity } from "../../types";

const LABELS: Record<Activity, string> = {
  online: "Online now",
  today: "Active today",
  week: "Active this week",
};

/** A friend's rough recent activity: a dot and words ("Online now", "Active today"). Nothing at all when there is nothing to show. */
export function ActivityBadge({ activity, className = "text-white/70" }: { activity?: Activity; className?: string }) {
  if (!activity || !(activity in LABELS)) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${activity === "online" ? "bg-emerald-400" : "bg-white/40"}`} />
      {LABELS[activity]}
    </span>
  );
}
