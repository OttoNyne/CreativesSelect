import { api } from "./client";
import type { LiveComment, LiveRoom } from "../types";

export const MAX_LIVE_COMMENT_LENGTH = 200;
export const MAX_LIVE_TITLE_LENGTH = 80;

// WebRTC handshake message passed between the host's and a listener's browsers.
export interface LiveSignal {
  id: string;
  from: string;
  kind: "offer" | "answer" | "ice";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export const liveApi = {
  list: () => api.get<{ lives: LiveRoom[]; config?: { mode: "mesh" | "sfu"; maxListeners: number } }>("/live"),
  get: (id: string) => api.get<{ live: LiveRoom }>(`/live/${id}`),
  start: (title: string) => api.post<{ live: LiveRoom }>("/live", { title }),
  end: (id: string) => api.post<void>(`/live/${id}/end`),
  join: (id: string) => api.post<{ live: LiveRoom }>(`/live/${id}/join`),
  leave: (id: string) => api.post<void>(`/live/${id}/leave`),
  heartbeat: (id: string) => api.post<{ status: "live" | "ended"; listenerCount: number }>(`/live/${id}/heartbeat`),
  /** A pass to this live's media-server room (big lives only). */
  token: (id: string) => api.post<{ url: string; token: string }>(`/live/${id}/token`),
  iceServers: () => api.get<{ iceServers: RTCIceServer[] }>("/live/ice"),
  signals: (id: string, after?: string) =>
    api.get<{ signals: LiveSignal[] }>(`/live/${id}/signals${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  sendSignal: (id: string, signal: { to: string; kind: LiveSignal["kind"]; data: unknown }) =>
    api.post<{ ok: true }>(`/live/${id}/signals`, signal),
  comments: (id: string, after?: string) =>
    api.get<{ comments: LiveComment[] }>(`/live/${id}/comments${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  comment: (id: string, body: string) => api.post<{ comment: LiveComment }>(`/live/${id}/comments`, { body }),
  deleteComment: (id: string, commentId: string) => api.delete<void>(`/live/${id}/comments/${commentId}`),
};

export type LiveApi = typeof liveApi;
