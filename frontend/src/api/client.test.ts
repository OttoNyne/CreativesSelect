import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, assetUrl, postForFile } from "./client";

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    statusText: "Status text",
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("sends cookies and returns the parsed body", async () => {
    const fetchFn = mockFetch(200, { hello: "world" });
    await expect(api.get("/x")).resolves.toEqual({ hello: "world" });
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/api\/x$/);
  });

  it("sends JSON bodies with a content type", async () => {
    const fetchFn = mockFetch(201, { ok: true });
    await api.post("/things", { a: 1 });
    const init = fetchFn.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for 204 responses", async () => {
    mockFetch(204);
    await expect(api.delete("/x")).resolves.toBeUndefined();
  });

  it("throws an ApiError carrying the server's message and status", async () => {
    mockFetch(429, { error: "Slow down" });
    const err = (await api.post("/x", {}).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.message).toBe("Slow down");
  });

  it("falls back to the status text when the error body isn't JSON", async () => {
    mockFetch(502);
    const err = (await api.get("/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Status text");
  });
});

describe("assetUrl", () => {
  it("passes absolute and data URLs through and ignores empty values", () => {
    expect(assetUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(assetUrl("data:image/svg+xml;base64,AAAA")).toBe("data:image/svg+xml;base64,AAAA");
    expect(assetUrl(null)).toBeUndefined();
    expect(assetUrl("")).toBeUndefined();
  });

  it("prefixes relative paths with the API origin", () => {
    expect(assetUrl("/uploads/a.png")).toMatch(/\/uploads\/a\.png$/);
  });
});

describe("postForFile", () => {
  function fileFetch(status: number, headers: Record<string, string>, body: unknown = "{}") {
    const fn = vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      statusText: "Status text",
      headers: { get: (name: string) => headers[name] ?? null },
      blob: async () => new Blob([JSON.stringify(body)], { type: "application/json" }),
      json: async () => body,
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("sends the body as JSON with the cookies, and returns the file with the server's name for it", async () => {
    const fn = fileFetch(200, { "Content-Disposition": 'attachment; filename="creativesselect-zoe-2026-10-07.json"' }, { hello: 1 });
    const { blob, filename } = await postForFile("/profiles/me/export", { password: "pw" });
    expect(filename).toBe("creativesselect-zoe-2026-10-07.json");
    expect(await blob.text()).toBe('{"hello":1}');
    expect(fn.mock.calls[0][0]).toMatch(/\/api\/profiles\/me\/export$/);
    expect(fn.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include", body: '{"password":"pw"}' });
  });

  it("uses a plain name when the server gave none, and never lets a name mean a folder", async () => {
    fileFetch(200, {});
    expect((await postForFile("/x", {})).filename).toBe("creativesselect-data.json");
    fileFetch(200, { "Content-Disposition": 'attachment; filename="../../etc/passwd"' });
    expect((await postForFile("/x", {})).filename).toBe(".._.._etc_passwd");
  });

  it("raises the server's own message, as the other calls do", async () => {
    fileFetch(403, {}, { error: "Incorrect password" });
    await expect(postForFile("/x", {})).rejects.toMatchObject({ status: 403, message: "Incorrect password" });
    fileFetch(429, {}, { error: "Too many attempts" });
    await expect(postForFile("/x", {})).rejects.toBeInstanceOf(ApiError);
  });
});
