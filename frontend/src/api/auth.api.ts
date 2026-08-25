import { api } from "./client";
import type { User } from "../types";

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const authApi = {
  register: (input: RegisterInput) => api.post<{ user: User }>("/auth/register", input),
  login: (input: LoginInput) => api.post<{ user: User }>("/auth/login", input),
  logout: () => api.post<void>("/auth/logout"),
  me: () => api.get<{ user: User }>("/auth/me"),
};
