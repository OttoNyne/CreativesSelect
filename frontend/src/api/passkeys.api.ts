import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { api } from "./client";
import type { User } from "../types";

/** One passkey as the owner sees it: a name and when it was made and last used, never anything that could be used to sign in. */
export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** Copied between the person's devices (for example by a password manager), rather than kept on one. */
  synced: boolean;
  backedUp: boolean;
}

export const passkeysApi = {
  list: () => api.get<{ passkeys: Passkey[]; rpId: string; max: number }>("/auth/passkeys"),
  /** Step one of adding one: needs the password (and a code, if two-step sign-in is on). */
  registerOptions: (password: string, code?: string) => api.post<PublicKeyCredentialCreationOptionsJSON>("/auth/passkeys/register/options", { password, ...(code ? { code } : {}) }),
  registerVerify: (response: RegistrationResponseJSON, name?: string) => api.post<{ passkey: Passkey }>("/auth/passkeys/register/verify", { response, ...(name ? { name } : {}) }),
  rename: (id: string, name: string) => api.patch<{ passkey: Passkey }>(`/auth/passkeys/${encodeURIComponent(id)}`, { name }),
  remove: (id: string, password: string) => api.delete<void>(`/auth/passkeys/${encodeURIComponent(id)}`, { password }),
  loginOptions: () => api.post<PublicKeyCredentialRequestOptionsJSON>("/auth/passkeys/login/options", {}),
  loginVerify: (response: AuthenticationResponseJSON) => api.post<{ user: User }>("/auth/passkeys/login/verify", { response }),
};
