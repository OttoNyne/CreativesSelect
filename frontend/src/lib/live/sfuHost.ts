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
  /** The connection to the media server couldn't be made, or was lost for good (after trying again a few times). */
  onFailed?: (message: string) => void;
  /** The connection dropped and is being restored ("reconnecting"), or is up ("live"). */
  onConnection?: (state: HostConnection) => void;
  /** The phone (or another app) paused or took the microphone: nobody can hear the host until it is back. */
  onMicrophone?: (state: MicrophoneState) => void;
  /** How many times to start over after the connection is lost, before giving up. */
  maxAttempts?: number;
  /** Loads the media-server client library (only needed for big lives, so it isn't in the main bundle). */
  loadClient?: () => Promise<typeof LiveKit>;
  heartbeatMs?: number;
}

export type HostConnection = "live" | "reconnecting";
export type MicrophoneState = "ok" | "paused" | "ended";

const loadLiveKit = () => import("livekit-client");
const RETRY_DELAY_MS = 1_500;

/**
 * The broadcaster's side for big lives: instead of sending their audio to each listener, the host sends it once to a
 * media server, which passes it on to everyone. Same shape as LiveHost, so the page treats them alike.
 */
export class SfuHost {
  private readonly opts: SfuHostOptions;
  private room: LiveKit.Room | null = null;
  private guestStream: MediaStream | null = null;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unwatchMicrophone: () => void = () => {};
  private stopped = false;
  private readonly heartbeatPoller: Poller;

  constructor(opts: SfuHostOptions) {
    this.opts = opts;
    this.heartbeatPoller = new Poller(() => this.beat(), opts.heartbeatMs ?? 20_000);
  }

  start() {
    this.watchMicrophone();
    void this.connect();
    this.heartbeatPoller.start();
  }

  // A phone turns the microphone off when the screen locks or another app wants it; say so, rather than carrying on in silence.
  private watchMicrophone() {
    const track = this.opts.stream.getAudioTracks()[0];
    if (!track?.addEventListener) return;
    const mute = () => this.opts.onMicrophone?.("paused");
    const unmute = () => this.opts.onMicrophone?.("ok");
    const ended = () => this.opts.onMicrophone?.("ended");
    track.addEventListener("mute", mute);
    track.addEventListener("unmute", unmute);
    track.addEventListener("ended", ended);
    this.unwatchMicrophone = () => {
      track.removeEventListener("mute", mute);
      track.removeEventListener("unmute", unmute);
      track.removeEventListener("ended", ended);
    };
  }

  /** Mutes or unmutes the broadcast (the microphone stays open, the audio goes silent). */
  setMuted(muted: boolean) {
    this.opts.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.unwatchMicrophone();
    this.heartbeatPoller.stop();
    this.room?.disconnect();
    this.room = null;
    this.opts.stream.getTracks().forEach((t) => t.stop());
  }

  private fail(message: string) {
    if (!this.stopped) this.opts.onFailed?.(message);
  }

  // The connection is gone for good: start over (new pass, new connection, same microphone) a few times, then give up.
  private recover() {
    if (this.stopped) return;
    const old = this.room;
    this.room = null;
    old?.disconnect();
    this.guestStream = null; // a new connection hands over the guests' audio afresh
    if (this.attempts >= (this.opts.maxAttempts ?? 3)) return this.fail("The connection to the live audio service was lost.");
    this.opts.onConnection?.("reconnecting");
    this.retryTimer = setTimeout(() => void this.connect(), RETRY_DELAY_MS * (this.attempts + 1));
  }

  private async connect() {
    if (this.stopped) return;
    this.attempts++;
    try {
      const { liveId, stream } = this.opts;
      const [{ url, token }, lk] = await Promise.all([this.opts.api.token(liveId), (this.opts.loadClient ?? loadLiveKit)()]);
      if (this.stopped) return;
      const room = new lk.Room();
      this.room = room;
      room.on(lk.RoomEvent.Disconnected, () => {
        if (this.room === room && !this.stopped) this.recover();
      });
      room.on(lk.RoomEvent.Reconnecting, () => this.room === room && this.opts.onConnection?.("reconnecting"));
      room.on(lk.RoomEvent.Reconnected, () => this.room === room && this.opts.onConnection?.("live"));
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
      this.attempts = 0;
      this.opts.onConnection?.("live");
    } catch (err) {
      // the server said no (the live is over, or this isn't allowed): trying again won't help
      if (err instanceof ApiError) return this.fail(err.message);
      // anything else is most likely the network: try again before giving up
      if (this.attempts >= (this.opts.maxAttempts ?? 3)) return this.fail("Couldn't connect to the live audio service.");
      this.room?.disconnect();
      this.room = null;
      this.opts.onConnection?.("reconnecting");
      this.retryTimer = setTimeout(() => void this.connect(), RETRY_DELAY_MS * this.attempts);
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
