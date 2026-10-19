import { api } from "./client";

/** Someone in a spotlight, as the main screen shows them: public facts only. */
export interface SpotlightPerson {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string;
  csVerified: boolean;
  tags: string[];
}

export interface SpotlightPicture {
  id: string;
  url: string;
  caption: string | null;
}

/** One of the two artist spotlights on the main screen. */
export interface Spotlight {
  slot: 1 | 2;
  /** A line the administrator wrote about them (may be empty). */
  note: string;
  user: SpotlightPerson;
  piece: SpotlightPicture | null;
}

/** A slot as an administrator sees it: empty, or who is in it, what was chosen, and whether they can be shown right now. */
export type AdminSlot =
  | { slot: 1 | 2; empty: true }
  | {
      slot: 1 | 2;
      empty: false;
      note: string;
      chosenPiece: string | null;
      hidden: "private" | "suspended" | "missing" | null;
      user: SpotlightPerson | null;
      piece: SpotlightPicture | null;
      since: string;
    };

export const MAX_SPOTLIGHT_NOTE = 140;

export const spotlightsApi = {
  /** The spotlights on the main screen (open to anyone, signed in or not). */
  list: () => api.get<{ spotlights: Spotlight[] }>("/spotlights"),
};

// Administrators only: everyone else gets a 404.
export const spotlightAdminApi = {
  slots: () => api.get<{ slots: AdminSlot[]; maxNote: number }>("/admin/spotlights"),
  /** Put a person in a slot (replacing whoever was there). `pieceId` is one of their own pictures; leave it out for automatic. */
  set: (slot: 1 | 2, body: { username: string; note?: string; pieceId?: string }) => api.put<{ slots: AdminSlot[]; maxNote: number }>(`/admin/spotlights/${slot}`, body),
  clear: (slot: 1 | 2) => api.delete<void>(`/admin/spotlights/${slot}`),
};
