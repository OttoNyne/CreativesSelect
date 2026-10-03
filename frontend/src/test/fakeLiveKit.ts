import type * as LiveKit from "livekit-client";
import { vi } from "vitest";

// A stand-in for the media-server client library, so the big-live code can be tested without a server.
export const RoomEvent = {
  TrackSubscribed: "trackSubscribed",
  TrackUnsubscribed: "trackUnsubscribed",
  Reconnecting: "reconnecting",
  Reconnected: "reconnected",
  Disconnected: "disconnected",
  ParticipantDisconnected: "participantDisconnected",
} as const;

export class FakeRoom {
  static all: FakeRoom[] = [];
  static failConnect: Error | null = null;
  static failMicrophone: Error | null = null;
  static reset() {
    FakeRoom.all = [];
    FakeRoom.failConnect = null;
    FakeRoom.failMicrophone = null;
  }

  handlers = new Map<string, (...args: unknown[]) => void>();
  connectedWith: { url: string; token: string } | null = null;
  disconnected = false;
  published: { track: unknown; options: unknown }[] = [];
  localParticipant = {
    publishTrack: vi.fn(async (track: unknown, options: unknown) => {
      this.published.push({ track, options });
    }),
    /** What the media server lets this person do; a guest's becomes true when they are brought on stage. */
    permissions: { canPublish: false } as { canPublish: boolean } | undefined,
    microphoneEnabled: false,
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
      if (FakeRoom.failMicrophone) throw FakeRoom.failMicrophone;
      this.localParticipant.microphoneEnabled = enabled;
    }),
  };

  constructor() {
    FakeRoom.all.push(this);
  }
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }
  connect = vi.fn(async (url: string, token: string) => {
    if (FakeRoom.failConnect) throw FakeRoom.failConnect;
    this.connectedWith = { url, token };
  });
  disconnect = vi.fn(() => {
    this.disconnected = true;
  });
  /** Pretend the media server told the room something happened. */
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }
}

export const lastRoom = () => FakeRoom.all[FakeRoom.all.length - 1];

export const fakeLiveKit = async () => ({ Room: FakeRoom, RoomEvent, Track: { Source: { Microphone: "microphone" } } }) as unknown as typeof LiveKit;

export class FakeMediaStream {
  tracks: unknown[];
  constructor(tracks: unknown[] = []) {
    this.tracks = tracks;
  }
  addTrack(track: unknown) {
    this.tracks.push(track);
  }
  removeTrack(track: unknown) {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}
