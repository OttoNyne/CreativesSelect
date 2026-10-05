import { api } from "./client";
import type { Track } from "../types";

export const MAX_TRACKS = 20;
/** Uploaded songs are files that cost storage; YouTube links can fill the rest of the list. */
export const MAX_UPLOADS = 5;
export const MAX_TRACK_TITLE = 100;
export const MAX_TRACK_ARTIST = 80;

export interface CreateTrackInput {
  title: string;
  artist?: string;
  sourceType: "upload" | "youtube";
  url: string;
}

export const tracksApi = {
  byUser: (username: string) => api.get<{ tracks: Track[] }>(`/profiles/${username}/tracks`),
  add: (input: CreateTrackInput) => api.post<{ track: Track }>("/tracks", input),
  remove: (id: string) => api.delete<void>(`/tracks/${id}`),
  /** Change your track's title or artist, or make it (or stop it being) the profile song. */
  update: (id: string, input: { title?: string; artist?: string; profileSong?: boolean }) => api.patch<{ track: Track }>(`/tracks/${id}`, input),
  /** Tell the server a listener played a track (it counts once a day per listener, and never your own plays). */
  played: (id: string) => api.post<{ counted: boolean; plays: number }>(`/tracks/${id}/play`),
  /** Put the owner's tracks in this order (every one of them, once each). Answers with the saved list. */
  reorder: (ids: string[]) => api.put<{ tracks: Track[] }>("/tracks/order", { ids }),
};
