import { api } from "./client";
import type { FriendRequest, Friendship, User } from "../types";

export const friendsApi = {
  list: () => api.get<{ friends: User[] }>("/friends"),
  requests: () => api.get<{ requests: FriendRequest[] }>("/friends/requests"),
  request: (username: string) => api.post<{ friendship: Friendship }>(`/friends/request/${username}`),
  accept: (requestId: string) => api.post<{ friendship: Friendship }>(`/friends/accept/${requestId}`),
  decline: (requestId: string) => api.post<{ friendship: Friendship }>(`/friends/decline/${requestId}`),
  remove: (friendId: string) => api.delete<void>(`/friends/${friendId}`),
};
