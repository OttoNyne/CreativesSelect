import { api } from "./client";
import type { CreditedPiece, MediaCredit } from "../types";

export const creditsApi = {
  /** Credit a friend on one of your pieces; they are asked, and it counts once they accept. */
  add: (itemId: string, username: string, role: string) => api.post<{ credit: MediaCredit }>(`/credits/for/${encodeURIComponent(itemId)}`, { username, role }),
  /** Say yes to a credit you were asked for. */
  accept: (id: string) => api.post<{ credit: { id: string; itemId: string; role: string; status: "pending" | "accepted" } }>(`/credits/${encodeURIComponent(id)}/accept`),
  /** Take a credit off a piece (the owner), or say no to / leave one (the person credited). */
  remove: (id: string) => api.delete<void>(`/credits/${encodeURIComponent(id)}`),
  /** The credits waiting for you to accept. */
  mine: () => api.get<{ requests: CreditedPiece[] }>("/credits/mine"),
  /** The pieces other people made that this person is credited on. */
  forUser: (username: string) => api.get<{ collaborations: CreditedPiece[] }>(`/credits/user/${encodeURIComponent(username)}`),
};
