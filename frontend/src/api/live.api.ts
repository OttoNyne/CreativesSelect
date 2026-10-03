import { api } from "./client";
import type { LiveComment, LiveRoom, LiveStage, StageState } from "../types";

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
  /** Who is on stage, and (for the host) who is waiting. */
  stage: (id: string) => api.get<LiveStage>(`/live/${id}/stage`),
  requestToSpeak: (id: string) => api.post<{ stage: StageState }>(`/live/${id}/stage/request`),
  /** Withdraw a request, turn down an invitation, or step down from the stage. */
  leaveStage: (id: string) => api.post<{ stage: StageState }>(`/live/${id}/stage/leave`),
  acceptInvite: (id: string) => api.post<{ stage: StageState }>(`/live/${id}/stage/accept`),
  inviteGuest: (id: string, userId: string) => api.post<{ stage: StageState }>(`/live/${id}/stage/invite`, { userId }),
  /** Host: turn down a request, take back an invitation, or send a guest back to listening. */
  removeGuest: (id: string, userId: string) => api.post<{ stage: StageState }>(`/live/${id}/stage/remove`, { userId }),
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
