import { api } from "./client";

export interface MutedPerson {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export const mutesApi = {
  /** The people you have muted and the words you have muted. */
  list: () => api.get<{ people: MutedPerson[]; words: string[] }>("/mutes"),
  /** Stop seeing someone's posts and notices. Nobody is told. */
  mute: (username: string) => api.put<{ muted: true }>(`/mutes/people/${encodeURIComponent(username)}`, {}),
  unmute: (username: string) => api.delete<void>(`/mutes/people/${encodeURIComponent(username)}`),
  /** Replace the words and phrases you have muted (up to 30). Answers with the list as kept (lower case, no repeats). */
  setWords: (words: string[]) => api.put<{ words: string[] }>("/mutes/words", { words }),
};
