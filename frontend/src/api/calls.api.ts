import { api } from "./client";
import type { CallApplicationRow, CallPerson, OpenCall } from "../types";

export interface CallInput {
  title: string;
  details: string;
  lookingFor: string[];
  budget?: string;
  /** A day, "2026-12-31". */
  deadline?: string | null;
}

const id = (value: string) => encodeURIComponent(value);

export const callsApi = {
  /** Open calls from people you can see, newest first, 20 a page. `forMe` keeps those that fit what you offer. */
  board: (opts: { forMe?: boolean; tag?: string; before?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.forMe) q.set("for", "me");
    if (opts.tag) q.set("tag", opts.tag);
    if (opts.before) q.set("before", opts.before);
    const query = q.toString();
    return api.get<{ calls: OpenCall[]; hasMore: boolean; next: string | null }>(`/calls${query ? `?${query}` : ""}`);
  },
  mine: () => api.get<{ calls: OpenCall[] }>("/calls/mine"),
  /** What you have answered, and how it went. */
  applied: () => api.get<{ applications: { id: string; status: "waiting" | "chosen" | "passed"; reply: string; createdAt: string; call: OpenCall }[] }>("/calls/applied"),
  create: (input: CallInput) => api.post<{ call: OpenCall; told: number }>("/calls", input),
  get: (callId: string) => api.get<{ call: OpenCall }>(`/calls/${id(callId)}`),
  update: (callId: string, changes: Partial<CallInput> & { status?: "open" | "closed" }) => api.patch<{ call: OpenCall }>(`/calls/${id(callId)}`, changes),
  remove: (callId: string) => api.delete<void>(`/calls/${id(callId)}`),
  /** Answer a call with a few words and/or one of your own pieces. */
  apply: (callId: string, input: { note?: string; piece?: string }) => api.post<{ application: { id: string; status: string } }>(`/calls/${id(callId)}/apply`, input),
  withdraw: (callId: string) => api.delete<void>(`/calls/${id(callId)}/apply`),
  /** Who answered your call (yours only). */
  applications: (callId: string) => api.get<{ applications: CallApplicationRow[] }>(`/calls/${id(callId)}/applications`),
  answer: (callId: string, applicationId: string, choose: boolean, reply?: string) =>
    api.post<{ application: { id: string; status: "chosen" | "passed"; reply: string } }>(`/calls/${id(callId)}/applications/${id(applicationId)}/answer`, { choose, ...(reply ? { reply } : {}) }),
  /** People who might fit your call (yours only). */
  matches: (callId: string) => api.get<{ people: CallPerson[] }>(`/calls/${id(callId)}/matches`),
};
