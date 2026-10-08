import { api } from "./client";

export interface MentionPerson {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isFriend: boolean;
}

export const mentionsApi = {
  /** The people to offer when someone has typed @ and the start of a name: friends first. Nothing typed yet gives friends only. */
  suggest: (query: string) => api.get<{ people: MentionPerson[] }>(`/mentions/suggest?q=${encodeURIComponent(query)}`),
};
