import { locale as currentLocale, t } from "../i18n";

/** "Fri, Oct 10, 7:00 PM": a date and time in the viewer's own time zone, in the language of the page. */
export function formatWhen(iso: string | Date, locale: string = currentLocale()): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** How long until a time, in a few words: "starting now", "in 25 minutes", "in 3 hours", "in 2 days". Past times say "started". */
export function untilText(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const ms = date.getTime() - now.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < -60_000) return t("time.started");
  if (ms < 60_000) return t("time.startingNow");
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t("time.in.minute", { n: minutes });
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return t("time.in.hour", { n: hours });
  return t("time.in.day", { n: Math.round(ms / 86_400_000) });
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
export function formatDay(iso: string | Date, locale: string = currentLocale()): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
}

/** How long a bulletin has left: "3 days left", "1 day left", "less than a day left". */
export function daysLeft(expiresAt: string | Date, now: Date = new Date()): string {
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(date.getTime())) return "";
  const left = (date.getTime() - now.getTime()) / 86_400_000;
  if (left < 1) return t("time.left.lessThanDay");
  return t("time.left.day", { n: Math.round(left) }); // a bulletin made a moment ago has "10 days", not "9"
}

/** A calendar day given as "2026-10-04" (a UTC day, as the server sends it), written out: "October 4, 2026". */
export function formatCalendarDay(day: string, locale: string = currentLocale()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

/** How long ago something was, in a few words: "just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function agoText(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const ms = now.getTime() - date.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return t("time.justNow");
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t("time.ago.minute", { n: minutes });
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return t("time.ago.hour", { n: hours });
  return t("time.ago.day", { n: Math.round(ms / 86_400_000) });
}

/** The short form for a post: "just now", "5m ago", "3h ago", "2d ago". */
export function shortAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return t("time.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("time.short.minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.short.hours", { n: hours });
  return t("time.short.days", { n: Math.floor(hours / 24) });
}
