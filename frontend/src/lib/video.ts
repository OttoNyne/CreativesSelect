// Portfolio videos are limited to 30 seconds and 30 MB.
export const MAX_VIDEO_SECONDS = 30;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

const CLOUDINARY_VIDEO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/;

// Uploaded videos live on Cloudinary in whatever format the phone/camera
// produced (often HEVC .mov, which most browsers can't play). Ask Cloudinary
// for a universally playable H.264 MP4 of the same file instead.
export function playableVideoUrl(url: string): string {
  const m = url.match(CLOUDINARY_VIDEO);
  if (!m) return url;
  return `${m[1]}f_mp4,vc_h264/${m[2].replace(/\.[a-z0-9]+$/i, "")}.mp4`;
}

// First-frame still for the <video> poster (so tiles aren't black before play).
export function videoPosterUrl(url: string): string | undefined {
  const m = url.match(CLOUDINARY_VIDEO);
  if (!m) return undefined;
  return `${m[1]}so_0,f_jpg/${m[2].replace(/\.[a-z0-9]+$/i, "")}.jpg`;
}

// A linked (not uploaded) direct video can't be measured, so it's played as a
// 30-second window: media-fragment start/end plus a guard in the player.
export function clipWindow(startSeconds: number): { start: number; end: number } {
  const start = Math.max(0, Math.floor(startSeconds || 0));
  return { start, end: start + MAX_VIDEO_SECONDS };
}

export function directVideoSrc(url: string, startSeconds: number): string {
  const { start, end } = clipWindow(startSeconds);
  return `${url}#t=${start},${end}`;
}

// Stored YouTube links are canonical (https://www.youtube.com/watch?v=ID).
export function youtubeId(url: string): string | null {
  try {
    const id = new URL(url).searchParams.get("v");
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(url: string, startSeconds: number): string | null {
  const id = youtubeId(url);
  if (!id) return null;
  const { start, end } = clipWindow(startSeconds);
  return `https://www.youtube-nocookie.com/embed/${id}?start=${start}&end=${end}&rel=0&playsinline=1&modestbranding=1`;
}

// Reads a local video's length in the browser (before uploading it). Resolves
// null if the browser can't read it (e.g. an HEVC .mov in Chrome) — the server
// still checks after upload, so that's not an error.
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    video.src = objectUrl;
  });
}

// Returns a message if the file can't be a portfolio video, else null.
export async function checkVideoFile(file: File): Promise<string | null> {
  if (file.size > MAX_VIDEO_BYTES) {
    return `That video is ${(file.size / 1024 / 1024).toFixed(0)} MB — the limit is 30 MB (try a shorter or lower-quality clip).`;
  }
  const duration = await readVideoDuration(file);
  if (duration !== null && duration > MAX_VIDEO_SECONDS + 0.5) {
    return `Videos can be up to ${MAX_VIDEO_SECONDS} seconds — this one is ${Math.round(duration)} seconds.`;
  }
  return null;
}
