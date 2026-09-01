import { HttpError } from "../../middleware/errorHandler";
import { ImageSearchResult } from "./AIService";

// Openverse indexes openly-licensed (CC) images and its search API is free
// and keyless, so this is real search — not a mock — regardless of which
// AIService provider is active.
const OPENVERSE_SEARCH_URL = "https://api.openverse.org/v1/images/";
const RESULT_COUNT = 12;

interface OpenverseResult {
  id: string;
  title: string | null;
  url: string;
  thumbnail: string;
  creator: string | null;
}

interface OpenverseResponse {
  results: OpenverseResult[];
}

export async function searchOpenverseImages(query: string): Promise<{ results: ImageSearchResult[] }> {
  const params = new URLSearchParams({
    q: query,
    page_size: String(RESULT_COUNT),
    mature: "false",
  });

  let response: Response;
  try {
    response = await fetch(`${OPENVERSE_SEARCH_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new HttpError(502, "Image search is unavailable right now");
  }

  if (!response.ok) {
    throw new HttpError(502, "Image search is unavailable right now");
  }

  const data = (await response.json()) as OpenverseResponse;
  const results: ImageSearchResult[] = (data.results ?? []).map((r) => ({
    id: r.id,
    url: r.url,
    thumbnailUrl: r.thumbnail,
    title: r.title ?? "Untitled",
    creator: r.creator ?? undefined,
  }));

  return { results };
}
