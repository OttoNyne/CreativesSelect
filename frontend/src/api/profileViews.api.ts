import { api } from "./client";
import type { ProfileVisitor } from "../types";

export const profileViewsApi = {
  /** Tells the server someone opened this profile. It always answers the same way and records only when both people opted in. */
  record: (username: string) => api.post<void>(`/profile-views/${encodeURIComponent(username)}`),
  /** Who has visited your profile in the last 30 days (only if you have profile views on). */
  list: () => api.get<{ visitors: ProfileVisitor[] }>("/profile-views"),
};
