import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaApi, uploadFile } from "./media.api";
import { ApiError } from "./client";

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const file = new File(["x"], "pic.png", { type: "image/png" });

afterEach(() => vi.unstubAllGlobals());

describe("uploadFile", () => {
  it("posts the file as multipart form data with the purpose, sending cookies", async () => {
    const fetchFn = mockFetch(201, { url: "https://cdn.example.com/a.png" });
    await expect(uploadFile(file, "avatars")).resolves.toEqual({ url: "https://cdn.example.com/a.png" });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(/\/api\/media\/upload\?purpose=avatars$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("throws an ApiError carrying the server's message (so the UI can show it)", async () => {
    mockFetch(413, { error: "That file is too large to upload — images can be up to 10 MB." });
    const err = (await uploadFile(file, "portfolio").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.message).toMatch(/up to 10 MB/);
  });

  it("falls back to a generic message when the error has no body", async () => {
    mockFetch(502);
    const err = (await uploadFile(file, "portfolio").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Upload failed");
  });
});

describe("comments on a piece", () => {
  it("asks for a page after a comment, writes, changes and removes by the right addresses", async () => {
    const fetchFn = mockFetch(200, { comments: [] });
    await mediaApi.comments("m1");
    await mediaApi.comments("m1", "c5");
    await mediaApi.addComment("m1", "Nice");
    await mediaApi.updateComment("c5", "Nicer");
    await mediaApi.removeComment("c5");
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);
    expect(calls).toEqual(["GET /media/m1/comments", "GET /media/m1/comments?after=c5", "POST /media/m1/comments", "PATCH /media/comments/c5", "DELETE /media/comments/c5"]);
    expect(JSON.parse(fetchFn.mock.calls[2][1].body)).toEqual({ content: "Nice" });
  });
});
