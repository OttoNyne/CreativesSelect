import { api, ApiError } from "./client";
import { API_BASE } from "./base";
import { translateServerMessage, t } from "../i18n";

/** Someone who drew a part, as the server shows them. */
export interface ChainArtist {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  csVerified: boolean;
}

export interface ChainPart {
  id: string;
  index: number;
  author: ChainArtist | null;
  /** The whole picture of this part (only given for a finished chain). */
  imageUrl: string;
}

/** A chain as the server shows it: a finished one with its parts, a waiting one only as far along as it is. */
export interface Chain {
  id: string;
  prompt: string;
  status: "open" | "complete";
  complete: boolean;
  count: number;
  parts: number;
  completedAt: string | null;
  mine: boolean;
  sections: ChainPart[];
  canDelete?: boolean;
  claimedByMe?: boolean;
}

/** A chain waiting for its next part, as the board lists it. */
export interface WaitingChain {
  id: string;
  prompt: string;
  count: number;
  parts: number;
  nextPart: number;
  edgeUrl: string;
  claimedByMe: boolean;
}

export const CHAIN_SECTION_WIDTH = 1200;
export const CHAIN_SECTION_HEIGHT = 400;
export const CHAIN_EDGE_HEIGHT = 40;

/** Sends a part as a form (the picture, its bottom strip and for a new chain the idea) and answers with what the server says. */
async function sendForm<T>(path: string, fields: { section: Blob; edge: Blob | null; prompt?: string }): Promise<T> {
  const form = new FormData();
  if (fields.prompt !== undefined) form.append("prompt", fields.prompt);
  form.append("section", fields.section, "section.png");
  if (fields.edge) form.append("edge", fields.edge, "edge.png");
  const res = await fetch(`${API_BASE}/api${path}`, { method: "POST", credentials: "include", body: form });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, translateServerMessage(data?.error ?? t("libmsg.uploadFailed")), data?.details);
  return data as T;
}

export const chainsApi = {
  /** Chains waiting for a part you could draw, a page at a time. */
  open: (page = 1) => api.get<{ chains: WaitingChain[]; hasMore: boolean }>(`/chains/open?page=${page}`),
  /** Finished chains, newest first. */
  complete: (page = 1) => api.get<{ chains: Chain[]; hasMore: boolean }>(`/chains/complete?page=${page}`),
  /** Every chain you drew a part of. */
  mine: () => api.get<{ chains: Chain[] }>("/chains/mine"),
  get: (id: string) => api.get<{ chain: Chain }>(`/chains/${encodeURIComponent(id)}`),
  /** Take the next part for a while: it is yours to draw. */
  claim: (id: string) => api.post<{ chain: WaitingChain; claimedUntil: string; minutes: number }>(`/chains/${encodeURIComponent(id)}/claim`, {}),
  /** Give the part back without drawing it. */
  release: (id: string) => api.delete<void>(`/chains/${encodeURIComponent(id)}/claim`),
  /** Take back a chain you started, while it is not finished. */
  remove: (id: string) => api.delete<void>(`/chains/${encodeURIComponent(id)}`),
  /** Start a chain with its first part. */
  start: (section: Blob, edge: Blob, prompt: string) => sendForm<{ chain: WaitingChain }>("/chains", { section, edge, prompt }),
  /** Draw the part you have taken (the last part needs no edge). */
  addPart: (id: string, section: Blob, edge: Blob | null) => sendForm<{ chain: Chain }>(`/chains/${encodeURIComponent(id)}/sections`, { section, edge }),
};
