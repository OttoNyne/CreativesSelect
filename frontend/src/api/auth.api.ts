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
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<void>("/auth/password", { currentPassword, newPassword }),
  resetAvailable: () => api.get<{ available: boolean }>("/auth/reset-available"),
  forgotPassword: (email: string) => api.post<{ message: string }>("/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) => api.post<void>("/auth/reset-password", { token, newPassword }),
  me: () => api.get<{ user: User }>("/auth/me"),
};
