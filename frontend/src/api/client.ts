import { API_BASE } from "./base";

const API_URL = API_BASE;

export class ApiError extends Error {
  status: number;
  details?: unknown;
  /** A short name the server gives to a few kinds of refusal that a page acts on (such as "challenge_expired"). */
  code?: string;

  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => undefined);

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? res.statusText, data?.details, typeof data?.code === "string" ? data.code : undefined);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

/** A POST whose answer is a file to save (the download of someone's own data): the file, and the name the server gave it. */
export async function postForFile(path: string, body: unknown): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_URL}/api${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => undefined);
    throw new ApiError(res.status, data?.error ?? res.statusText, data?.details, typeof data?.code === "string" ? data.code : undefined);
  }
  const named = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  // a name from a server is only ever used as a file name: nothing that could mean a folder
  const filename = (named ?? "creativesselect-data.json").replace(/[^\w.-]/g, "_");
  return { blob: await res.blob(), filename };
}

export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${API_URL}${path}`;
}
