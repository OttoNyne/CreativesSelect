import { api } from "./client";
import type { User } from "../types";

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName: string;
  /** The code from an invite link, if they came in through one. */
  invite?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** One place the person is signed in (see where-you-are-signed-in on the profile). */
export interface SignedInDevice {
  id: string;
  /** A plain label such as "Chrome on Windows". */
  device: string;
  /** The device being used right now. */
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export const authApi = {
  register: (input: RegisterInput) => api.post<{ user: User; invitedBy?: string }>("/auth/register", input),
  login: (input: LoginInput) => api.post<{ user: User }>("/auth/login", input),
  logout: () => api.post<void>("/auth/logout"),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<void>("/auth/password", { currentPassword, newPassword }),
  resetAvailable: () => api.get<{ available: boolean }>("/auth/reset-available"),
  forgotPassword: (email: string) => api.post<{ message: string }>("/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) => api.post<void>("/auth/reset-password", { token, newPassword }),
  verifyEmail: (token: string) => api.post<void>("/auth/verify-email", { token }),
  resendVerification: () => api.post<void>("/auth/resend-verification"),
  me: () => api.get<{ user: User }>("/auth/me"),
  sessions: () => api.get<{ sessions: SignedInDevice[] }>("/auth/sessions"),
  endSession: (id: string) => api.delete<void>(`/auth/sessions/${encodeURIComponent(id)}`),
  endOtherSessions: () => api.post<{ ended: number }>("/auth/sessions/end-others"),
};
