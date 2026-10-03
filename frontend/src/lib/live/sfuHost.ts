import type * as LiveKit from "livekit-client";
import { ApiError } from "../../api/client";
import type { LiveApi } from "../../api/live.api";
import { Poller } from "./rtc";

export interface SfuHostOptions {
  liveId: string;
  stream: MediaStream;
  api: Pick<LiveApi, "token" | "heartbeat">;
  onListenerCount?: (count: number) => void;
  /** The voices of guests on stage, as one stream for the page to play (the host already hears themselves). */
  onGuestStream?: (stream: MediaStream) => void;
  onEnded?: () => void;
  /** The connection to the media server couldn't be made, or was lost for good. */
  onFailed?: (message: string) => void;
  /** Loads the media-server client library (only needed for big lives, so it isn't in the main bundle). */
  loadClient?: () => Promise<typeof LiveKit>;
  heartbeatMs?: number;
}

const loadLiveKit = () => import("livekit-client");

/**
 * The broadcaster's side for big lives: instead of sending their audio to each listener, the host sends it once to a
 * media server, which passes it on to everyone. Same shape as LiveHost, so the page treats them alike.
 */
export class SfuHost {
  private readonly opts: SfuHostOptions;
  private room: LiveKit.Room | null = null;
  private guestStream: MediaStream | null = null;
  private stopped = false;
  private readonly heartbeatPoller: Poller;

  constructor(opts: SfuHostOptions) {
    this.opts = opts;
    this.heartbeatPoller = new Poller(() => this.beat(), opts.heartbeatMs ?? 20_000);
  }

  start() {
    void this.connect();
    this.heartbeatPoller.start();
  }

  /** Mutes or unmutes the broadcast (the microphone stays open, the audio goes silent). */
  setMuted(muted: boolean) {
    this.opts.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  stop() {
    this.stopped = true;
    this.heartbeatPoller.stop();
    this.room?.disconnect();
    this.room = null;
    this.opts.stream.getTracks().forEach((t) => t.stop());
  }

  private fail(message: string) {
    if (!this.stopped) this.opts.onFailed?.(message);
  }

  private async connect() {
    try {
      const { liveId, stream } = this.opts;
      const [{ url, token }, lk] = await Promise.all([this.opts.api.token(liveId), (this.opts.loadClient ?? loadLiveKit)()]);
      if (this.stopped) return;
      const room = new lk.Room();
      this.room = room;
      room.on(lk.RoomEvent.Disconnected, () => this.fail("The connection to the live audio service was lost."));
      // guests the host has brought on stage: everyone's voice goes into one stream
      room.on(lk.RoomEvent.TrackSubscribed, (track) => {
        if (this.room !== room || track.kind !== "audio") return;
        if (this.guestStream) {
          this.guestStream.addTrack(track.mediaStreamTrack);
        } else {
          this.guestStream = new MediaStream([track.mediaStreamTrack]);
          this.opts.onGuestStream?.(this.guestStream);
        }
      });
      room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
        if (this.room === room && track.kind === "audio") this.guestStream?.removeTrack(track.mediaStreamTrack);
      });
      await room.connect(url, token);
      if (this.stopped) return void room.disconnect();
      const track = stream.getAudioTracks()[0];
      if (!track) return this.fail("No microphone audio to broadcast.");
      await room.localParticipant.publishTrack(track, { source: lk.Track.Source.Microphone, name: "microphone" });
    } catch (err) {
      this.fail(err instanceof ApiError ? err.message : "Couldn't connect to the live audio service.");
    }
  }

  private async beat() {
    try {
      const { status, listenerCount } = await this.opts.api.heartbeat(this.opts.liveId);
      this.opts.onListenerCount?.(listenerCount);
      if (status === "ended") this.finish();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) this.finish();
    }
  }

  private finish() {
    if (this.stopped) return;
    this.stop();
    this.opts.onEnded?.();
  }
}
