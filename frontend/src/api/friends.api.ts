import { api } from "./client";
import type { FriendRequest, FriendSuggestion, Friendship, ProfileMutual, User } from "../types";

export const friendsApi = {
  list: () => api.get<{ friends: User[] }>("/friends"),
  requests: () => api.get<{ requests: FriendRequest[] }>("/friends/requests"),
  request: (username: string) => api.post<{ friendship: Friendship }>(`/friends/request/${username}`),
  accept: (requestId: string) => api.post<{ friendship: Friendship }>(`/friends/accept/${requestId}`),
  decline: (requestId: string) => api.post<{ friendship: Friendship }>(`/friends/decline/${requestId}`),
  remove: (friendId: string) => api.delete<void>(`/friends/${friendId}`),
  /** The friends you and someone else share (the number, and up to eight of them). */
  mutual: (username: string) => api.get<ProfileMutual>(`/friends/mutual/${encodeURIComponent(username)}`),
  /** People you may know: friends of your friends you aren't connected to, most in common first. */
  suggestions: () => api.get<{ suggestions: FriendSuggestion[] }>("/friends/suggestions"),
  /** "Not interested": they aren't suggested to you again. */
  dismissSuggestion: (username: string) => api.post<void>(`/friends/suggestions/dismiss/${encodeURIComponent(username)}`),
};
