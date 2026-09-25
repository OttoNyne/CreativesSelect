import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkVideoFile,
  clipWindow,
  directVideoSrc,
  playableVideoUrl,
  videoPosterUrl,
  youtubeEmbedUrl,
  youtubeId,
} from "./video";

const CLOUD = "https://res.cloudinary.com/demo/video/upload/v123/creativeselect/portfolio/abc.mov";

describe("video URLs", () => {
  it("asks Cloudinary for an H.264 MP4 of an uploaded video, whatever the original format", () => {
    expect(playableVideoUrl(CLOUD)).toBe("https://res.cloudinary.com/demo/video/upload/f_mp4,vc_h264/v123/creativeselect/portfolio/abc.mp4");
  });

  it("leaves non-Cloudinary links alone", () => {
    expect(playableVideoUrl("https://cdn.example.com/a.mp4")).toBe("https://cdn.example.com/a.mp4");
    expect(videoPosterUrl("https://cdn.example.com/a.mp4")).toBeUndefined();
  });

  it("builds a first-frame poster for uploaded videos", () => {
    expect(videoPosterUrl(CLOUD)).toBe("https://res.cloudinary.com/demo/video/upload/so_0,f_jpg/v123/creativeselect/portfolio/abc.jpg");
  });
});

describe("30-second clip windows", () => {
  it("plays 30 seconds from the start time", () => {
    expect(clipWindow(0)).toEqual({ start: 0, end: 30 });
    expect(clipWindow(42)).toEqual({ start: 42, end: 72 });
    expect(clipWindow(-5)).toEqual({ start: 0, end: 30 });
    expect(clipWindow(7.9)).toEqual({ start: 7, end: 37 });
  });

  it("adds the media fragment to a direct link", () => {
    expect(directVideoSrc("https://cdn.example.com/a.mp4", 10)).toBe("https://cdn.example.com/a.mp4#t=10,40");
  });

  it("embeds a stored YouTube link with start and end, on the privacy-friendly domain", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 15)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=15&end=45&rel=0&playsinline=1&modestbranding=1"
    );
  });

  it("refuses to build an embed from anything that isn't a valid stored YouTube link", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeId("not a url")).toBeNull();
    expect(youtubeEmbedUrl("https://evil.example.net/watch?v=<script>", 0)).toBeNull();
  });
});

describe("checkVideoFile", () => {
  afterEach(() => vi.restoreAllMocks());

  function fakeDuration(seconds: number | null) {
    // jsdom doesn't decode video, so stand in for the <video> element's metadata event.
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "video") return real(tag);
      const fake: Record<string, unknown> = {
        removeAttribute: () => {},
        set src(_v: string) {
          setTimeout(() => (seconds === null ? (fake.onerror as () => void)?.() : (fake.onloadedmetadata as () => void)?.()), 0);
        },
        duration: seconds,
      };
      return fake as unknown as HTMLElement;
    }) as typeof document.createElement);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  }
  const clip = (bytes = 1000) => new File([new Uint8Array(bytes)], "clip.mp4", { type: "video/mp4" });

  it("accepts a short clip", async () => {
    fakeDuration(12);
    expect(await checkVideoFile(clip())).toBeNull();
  });

  it("accepts exactly 30 seconds", async () => {
    fakeDuration(30);
    expect(await checkVideoFile(clip())).toBeNull();
  });

  it("rejects a clip over 30 seconds with its length", async () => {
    fakeDuration(42.4);
    expect(await checkVideoFile(clip())).toMatch(/up to 30 seconds — this one is 42 seconds/);
  });

  it("rejects a file over 30 MB without even reading it", async () => {
    const big = new File([new Uint8Array(1)], "big.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: 45 * 1024 * 1024 });
    expect(await checkVideoFile(big)).toMatch(/45 MB.*30 MB/);
  });

  it("lets the server decide when the browser can't read the length", async () => {
    fakeDuration(null);
    expect(await checkVideoFile(clip())).toBeNull();
  });
});
