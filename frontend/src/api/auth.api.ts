import { api } from "./client";
import type { User } from "../types";
import { language } from "../i18n";

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

/** What logging in gives back: the person, or (when they've turned on two-step sign-in) a note to send with the code from their app. */
export type LoginResult = { user: User } | { twoFactorRequired: true; challenge: string };

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

export const authApi = {
  // the page's language goes with it, so the emails the site sends this person are in it too
  register: (input: RegisterInput) => api.post<{ user: User; invitedBy?: string }>("/auth/register", { ...input, language: language() }),
  login: (input: LoginInput) => api.post<LoginResult>("/auth/login", input),
  loginTwoFactor: (challenge: string, code: string) => api.post<{ user: User; recoveryCodesLeft: number }>("/auth/login/2fa", { challenge, code }),
  logout: () => api.post<void>("/auth/logout"),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<void>("/auth/password", { currentPassword, newPassword }),
  resetAvailable: () => api.get<{ available: boolean }>("/auth/reset-available"),
  forgotPassword: (email: string) => api.post<{ message: string }>("/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) => api.post<void>("/auth/reset-password", { token, newPassword }),
  verifyEmail: (token: string) => api.post<void>("/auth/verify-email", { token }),
  resendVerification: () => api.post<void>("/auth/resend-verification"),
  me: () => api.get<{ user: User }>("/auth/me"),
  /** Asks to change the account's email: a link goes to the new address, and nothing changes until it is opened. */
  requestEmailChange: (newEmail: string, password: string, code?: string) => api.post<void>("/auth/email/change", { newEmail, password, ...(code ? { code } : {}) }),
  /** The link from the new address. */
  confirmEmailChange: (token: string) => api.post<void>("/auth/email/confirm", { token }),
  /** The link from the old address: puts it back and signs every device out. */
  revertEmailChange: (token: string) => api.post<void>("/auth/email/revert", { token }),
  twoFactorStatus: () => api.get<TwoFactorStatus>("/auth/2fa"),
  twoFactorSetup: (password: string) => api.post<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", { password }),
  twoFactorEnable: (code: string) => api.post<{ recoveryCodes: string[] }>("/auth/2fa/enable", { code }),
  twoFactorDisable: (password: string, code: string) => api.post<void>("/auth/2fa/disable", { password, code }),
  twoFactorNewRecoveryCodes: (password: string, code: string) => api.post<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes", { password, code }),
  sessions: () => api.get<{ sessions: SignedInDevice[]; signInAlerts: boolean }>("/auth/sessions"),
  /** Whether to be emailed when someone signs in from a browser the person hasn't used before. */
  setSignInAlerts: (enabled: boolean) => api.put<{ signInAlerts: boolean }>("/auth/sign-in-alerts", { enabled }),
  endSession: (id: string) => api.delete<void>(`/auth/sessions/${encodeURIComponent(id)}`),
  endOtherSessions: () => api.post<{ ended: number }>("/auth/sessions/end-others"),
};
