import { api } from "./client";
import type { Album } from "../types";

export const MAX_ALBUM_TITLE = 60;
export const MAX_ALBUMS = 12;

export const albumsApi = {
  /** Someone's albums, oldest first. */
  byUser: (username: string) => api.get<{ albums: Album[] }>(`/albums/user/${encodeURIComponent(username)}`),
  create: (title: string) => api.post<{ album: Album }>("/albums", { title }),
  rename: (id: string, title: string) => api.patch<{ album: Album }>(`/albums/${encodeURIComponent(id)}`, { title }),
  /** Deleting an album keeps its pieces in the portfolio. */
  remove: (id: string) => api.delete<void>(`/albums/${encodeURIComponent(id)}`),
};
