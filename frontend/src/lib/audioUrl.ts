import { assetUrl } from "../api/client";

// Formats iPhones and Safari can't play. Cloudinary converts audio on the fly, so for these
// the song is requested as an MP3 instead (inserting a transformation into the stored URL).
const NOT_PLAYABLE_ON_IOS = /\.(ogg|oga|opus|webm)(\?.*)?$/i;

export function playableAudioUrl(url: string): string | undefined {
  const full = assetUrl(url);
  if (!full) return undefined;
  if (NOT_PLAYABLE_ON_IOS.test(full) && full.includes("/upload/")) {
    return full.replace("/upload/", "/upload/f_mp3/").replace(NOT_PLAYABLE_ON_IOS, ".mp3");
  }
  return full;
}
