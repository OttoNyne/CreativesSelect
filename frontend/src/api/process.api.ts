import { api } from "./client";
import type { ProcessStep } from "../types";

export const processApi = {
  /** The steps of how a piece was made, in order. */
  steps: (pieceId: string) => api.get<{ steps: ProcessStep[] }>(`/media/${encodeURIComponent(pieceId)}/process`),
  /** Add a step to your own piece: words, a picture you uploaded, or both. */
  add: (pieceId: string, input: { content?: string; imageUrl?: string }) => api.post<{ step: ProcessStep }>(`/media/${encodeURIComponent(pieceId)}/process`, input),
  /** Change a step's words. */
  setWords: (stepId: string, content: string) => api.patch<{ step: ProcessStep }>(`/media/process/${encodeURIComponent(stepId)}`, { content }),
  /** Take the picture off a step (the words stay). */
  removePicture: (stepId: string) => api.patch<{ step: ProcessStep }>(`/media/process/${encodeURIComponent(stepId)}`, { imageUrl: null }),
  remove: (stepId: string) => api.delete<void>(`/media/process/${encodeURIComponent(stepId)}`),
  /** Put the steps in a new order: every step's id, once. */
  reorder: (pieceId: string, ids: string[]) => api.put<{ steps: ProcessStep[] }>(`/media/${encodeURIComponent(pieceId)}/process/order`, { ids }),
};
