// How long ago, how long until, and how long is left. Each is a plural: one text per form the language needs.
export const time = {
  "time.justNow": "just now",
  "time.started": "started",
  "time.startingNow": "starting now",
  "time.ago.minute": { one: "{n} minute ago", other: "{n} minutes ago" },
  "time.ago.hour": { one: "{n} hour ago", other: "{n} hours ago" },
  "time.ago.day": { one: "{n} day ago", other: "{n} days ago" },
  "time.in.minute": { one: "in {n} minute", other: "in {n} minutes" },
  "time.in.hour": { one: "in {n} hour", other: "in {n} hours" },
  "time.in.day": { one: "in {n} day", other: "in {n} days" },
  "time.left.day": { one: "{n} day left", other: "{n} days left" },
  "time.left.lessThanDay": "less than a day left",
  "time.short.minutes": "{n}m ago",
  "time.short.hours": "{n}h ago",
  "time.short.days": "{n}d ago",
} as const;
