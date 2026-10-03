import { afterEach, describe, expect, it, vi } from "vitest";
import { aiApi } from "./ai.api";
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

afterEach(() => vi.unstubAllGlobals());

describe("aiApi.generateWallpaper", () => {
  it("sends the description, how closely to follow the photo and the photo itself as a form, with cookies", async () => {
    const fetchFn = mockFetch(200, { url: "https://cdn/w.jpg", usedReference: true });
    const photo = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    await expect(aiApi.generateWallpaper({ prompt: "a harbor", reference: photo, closeness: "close" })).resolves.toEqual({ url: "https://cdn/w.jpg", usedReference: true });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(/\/api\/ai\/wallpaper$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined(); // the browser sets the form's content type, with its boundary
    const form = init.body as FormData;
    expect(form.get("prompt")).toBe("a harbor");
    expect(form.get("closeness")).toBe("close");
    expect((form.get("reference") as File).name).toBe("reference.jpg");
  });

  it("sends only the description when there is no photo", async () => {
    const fetchFn = mockFetch(200, { url: "https://cdn/w.jpg", usedReference: false });
    await aiApi.generateWallpaper({ prompt: "a harbor" });
    const form = fetchFn.mock.calls[0][1].body as FormData;
    expect(form.has("reference")).toBe(false);
    expect(form.has("closeness")).toBe(false);
  });

  it("throws the server's reason, with its status", async () => {
    mockFetch(413, { error: "That photo is too large — use one under 4 MB." });
    const err = await aiApi.generateWallpaper({ prompt: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.message).toMatch(/under 4 MB/);
  });

  it("has a plain message when the reply isn't readable", async () => {
    mockFetch(502);
    const err = await aiApi.generateWallpaper({ prompt: "x" }).catch((e) => e);
    expect(err.message).toBe("Couldn't make a wallpaper, try again.");
  });
});

describe("aiApi.discard", () => {
  it("asks the server to remove an unused picture, and never throws", async () => {
    const fetchFn = mockFetch(204);
    await aiApi.discard("https://cdn/unused.jpg");
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/api\/ai\/discard$/);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ url: "https://cdn/unused.jpg" });

    mockFetch(500, { error: "boom" });
    await expect(aiApi.discard("https://cdn/unused.jpg")).resolves.toBeUndefined();
  });
});
