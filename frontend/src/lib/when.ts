/** "Fri, Oct 10, 7:00 PM": a date and time in the viewer's own time zone. */
export function formatWhen(iso: string | Date, locale?: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** How long until a time, in a few words: "starting now", "in 25 minutes", "in 3 hours", "in 2 days". Past times say "started". */
export function untilText(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const ms = date.getTime() - now.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < -60_000) return "started";
  if (ms < 60_000) return "starting now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(ms / 86_400_000);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** The earliest time a plan can be made for (the server wants at least 5 minutes ahead), as a datetime-local value. */
export function earliestStart(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 6 * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A time as the value of a datetime-local box (the viewer's own time zone), for changing something already planned. */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "October 4, 2026": a date on its own, in the viewer's own time zone. */
export function formatDay(iso: string | Date, locale?: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
}

/** How long a bulletin has left: "3 days left", "1 day left", "less than a day left". */
export function daysLeft(expiresAt: string | Date, now: Date = new Date()): string {
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(date.getTime())) return "";
  const left = (date.getTime() - now.getTime()) / 86_400_000;
  if (left < 1) return "less than a day left";
  const days = Math.round(left); // a bulletin made a moment ago has "10 days", not "9"
  return `${days} day${days === 1 ? "" : "s"} left`;
}

/** A calendar day given as "2026-10-04" (a UTC day, as the server sends it), written out: "October 4, 2026". */
export function formatCalendarDay(day: string, locale?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}
