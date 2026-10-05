import { api } from "./client";
import { API_BASE } from "./base";
import type { CommunityEvent, EventAnswer, User } from "../types";

export const EVENT_LIMITS = { title: 80, description: 1000, place: 120, link: 300 } as const;

/** What you may set on an event. On a change, only send what changed. */
export interface EventInput {
  title?: string;
  description?: string;
  kind?: "in_person" | "online";
  place?: string;
  link?: string;
  audience?: "friends" | "public";
  startsAt?: string;
  endsAt?: string | null;
}

export type EventFilter = "upcoming" | "going" | "mine";

export const eventsApi = {
  /** Events you may see, soonest first, 20 a page: everything coming up, the ones you answered, or the ones you host. */
  list: (filter: EventFilter = "upcoming", page = 1) => {
    const query = [filter !== "upcoming" ? `filter=${filter}` : "", page > 1 ? `page=${page}` : ""].filter(Boolean).join("&");
    return api.get<{ events: CommunityEvent[]; page: number; hasMore: boolean }>(`/events${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<{ event: CommunityEvent }>(`/events/${encodeURIComponent(id)}`),
  create: (input: EventInput) => api.post<{ event: CommunityEvent }>("/events", input),
  update: (id: string, input: EventInput) => api.patch<{ event: CommunityEvent }>(`/events/${encodeURIComponent(id)}`, input),
  cancel: (id: string) => api.delete<void>(`/events/${encodeURIComponent(id)}`),
  /** Say going, maybe, or none (take your answer back). */
  rsvp: (id: string, status: EventAnswer | "none") => api.put<{ myStatus: EventAnswer | null; goingCount: number; maybeCount: number }>(`/events/${encodeURIComponent(id)}/rsvp`, { status }),
  /** Who said going (or maybe), 50 a page. */
  guests: (id: string, status: EventAnswer = "going", page = 1) =>
    api.get<{ guests: User[]; page: number; hasMore: boolean }>(`/events/${encodeURIComponent(id)}/guests?status=${status}${page > 1 ? `&page=${page}` : ""}`),
  /** Where the .ics file for adding it to a calendar is (a link to follow, not a request to make). */
  calendarUrl: (id: string) => `${API_BASE}/api/events/${encodeURIComponent(id)}/calendar.ics`,
};
