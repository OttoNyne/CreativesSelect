import { describe, expect, it } from "vitest";
import { playableAudioUrl } from "./audioUrl";

const cdn = "https://res.cloudinary.com/demo/video/upload/v1/creativeselect/tracks";

describe("playableAudioUrl", () => {
  it("leaves formats iPhones can play as they are", () => {
    for (const ext of ["mp3", "m4a", "aac", "wav", "mp4"]) {
      expect(playableAudioUrl(`${cdn}/song.${ext}`)).toBe(`${cdn}/song.${ext}`);
    }
  });

  it("asks Cloudinary for an MP3 when the song is one Safari can't play (ogg, opus, webm)", () => {
    for (const ext of ["ogg", "oga", "opus", "webm", "OGG"]) {
      expect(playableAudioUrl(`${cdn}/song.${ext}`)).toBe("https://res.cloudinary.com/demo/video/upload/f_mp3/v1/creativeselect/tracks/song.mp3");
    }
  });

  it("only converts files on Cloudinary's upload path, never other addresses", () => {
    expect(playableAudioUrl("https://example.com/song.ogg")).toBe("https://example.com/song.ogg");
  });

  it("copes with a query string and with nothing at all", () => {
    expect(playableAudioUrl(`${cdn}/song.ogg?x=1`)).toBe("https://res.cloudinary.com/demo/video/upload/f_mp3/v1/creativeselect/tracks/song.mp3");
    expect(playableAudioUrl("")).toBeUndefined();
  });
});
