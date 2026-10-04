import { api } from "./client";
import type { Invite, Inviter } from "../types";

export const invitesApi = {
  /** Your invite links that can still be used, with who came in through each. */
  list: () => api.get<{ invites: Invite[] }>("/invites"),
  create: () => api.post<{ invite: Invite }>("/invites"),
  /** Switch a link off. People who already came in through it stay your friends. */
  revoke: (id: string) => api.delete<void>(`/invites/${encodeURIComponent(id)}`),
  /** Who is inviting, for the person opening the link (no sign-in needed). 404 when the link can't be used any more. */
  preview: (code: string) => api.get<{ inviter: Inviter }>(`/invites/preview/${encodeURIComponent(code)}`),
};
