import { api } from "./client";
import type { Critique, CritiqueNote } from "../types";

const id = (value: string) => encodeURIComponent(value);

export interface NoteInput {
  working?: string;
  change?: string;
}

export const critiquesApi = {
  /** Open requests for feedback from people you can see, newest first, twenty a page. */
  board: (before?: string) => api.get<{ critiques: Critique[]; hasMore: boolean; next: string | null }>(`/critiques${before ? `?before=${id(before)}` : ""}`),
  mine: () => api.get<{ critiques: Critique[] }>("/critiques/mine"),
  answered: () => api.get<{ answers: { note: CritiqueNote; critique: Critique }[] }>("/critiques/answered"),
  /** Ask for feedback on one of your own pieces. */
  ask: (piece: string, question?: string) => api.post<{ critique: Critique }>("/critiques", { piece, ...(question ? { question } : {}) }),
  get: (critiqueId: string) => api.get<{ critique: Critique }>(`/critiques/${id(critiqueId)}`),
  update: (critiqueId: string, changes: { question?: string; status?: "open" | "closed" }) => api.patch<{ critique: Critique }>(`/critiques/${id(critiqueId)}`, changes),
  remove: (critiqueId: string) => api.delete<void>(`/critiques/${id(critiqueId)}`),
  give: (critiqueId: string, input: NoteInput) => api.post<{ note: CritiqueNote }>(`/critiques/${id(critiqueId)}/notes`, input),
  editMine: (critiqueId: string, input: NoteInput) => api.patch<{ note: CritiqueNote }>(`/critiques/${id(critiqueId)}/notes/mine`, input),
  withdrawMine: (critiqueId: string) => api.delete<void>(`/critiques/${id(critiqueId)}/notes/mine`),
  thank: (critiqueId: string, noteId: string) => api.put<{ note: CritiqueNote }>(`/critiques/${id(critiqueId)}/notes/${id(noteId)}/thanks`, {}),
  removeNote: (critiqueId: string, noteId: string) => api.delete<void>(`/critiques/${id(critiqueId)}/notes/${id(noteId)}`),
};
