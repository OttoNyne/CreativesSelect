import type * as LiveKit from "livekit-client";
import { ApiError } from "../../api/client";
import type { LiveApi } from "../../api/live.api";
import type { ListenerState } from "./listener";
import { Poller } from "./rtc";
import { micErrorMessage } from "./hostStream";
import { t } from "../../i18n";

export interface SfuListenerOptions {
  liveId: string;
  hostId: string;
  api: Pick<LiveApi, "join" | "leave" | "token" | "heartbeat">;
  onState: (state: ListenerState) => void;
  onStream: (stream: MediaStream) => void;
  onListenerCount?: (count: number) => void;
  onJoined?: () => void;
  loadClient?: () => Promise<typeof LiveKit>;
  heartbeatMs?: number;
  maxAttempts?: number;
  /** Go through the media server's relay from the first connection (for a phone on mobile data, where the direct route is often blocked). */
  startWithRelay?: boolean;
  /** A guest's microphone couldn't be turned back on after the connection was rebuilt (so nobody can hear them), in words fit to show. */
  onSpeakingLost?: (message: string) => void;
}

const loadLiveKit = () => import("livekit-client");

// Some networks (certain mobile carriers, hotel and office Wi-Fi) block the direct audio route the connection tries first. A connection that
// fails or drops soon after it starts is the sign; from then on the audio goes through the media server's relay over an ordinary secure web
// connection, as the host's side already does.
const HEALTHY_AFTER_MS = 30_000;

/** How long to wait for the media server to let a newly invited guest's microphone through. */
const PERMISSION_WAIT_MS = 6_000;

/**
 * A listener's side for big lives: join the room, connect to the media server with a listen-only pass, and play the
 * host's audio as it arrives (and the voices of any guests the host brings on stage, mixed into the same stream).
 * A guest who accepts the host's invitation can turn their microphone on over the same connection. Same shape as LiveListener, so the page treats them alike. The media client already
 * rides out short network drops by itself; this only starts over (a few times) if it gives up completely.
 */
export class SfuListener {
  private readonly opts: SfuListenerOptions;
  private room: LiveKit.Room | null = null;
  /** Everything being said in the room, as one stream, so a single audio element plays the host and every guest. */
  private stream: MediaStream | null = null;
  private attempts = 0;
  private stopped = false;
  private useRelay = false;
  /** When the current connection attempt began. */
  private startedAt = 0;
  /** Whether a guest has their microphone on (and whether it is muted), so a rebuilt connection can put it back the way it was. */
  private speaking = false;
  private speakingMuted = false;
  private failed = false;
  private readonly heartbeatPoller: Poller;
  private readonly onOnline = () => {
    // the phone got its network back: don't leave a person looking at "couldn't connect" until they tap
    if (this.failed && !this.stopped) void this.retry();
  };

  constructor(opts: SfuListenerOptions) {
    this.opts = opts;
    this.useRelay = Boolean(opts.startWithRelay);
    this.heartbeatPoller = new Poller(() => this.beat(), opts.heartbeatMs ?? 20_000);
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
  }

  /** Joins the room (throws the API's error if it's full or over) and connects to the media server. */
  async start() {
    await this.opts.api.join(this.opts.liveId);
    this.opts.onJoined?.();
    this.heartbeatPoller.start();
    await this.connect();
  }

  async leave() {
    if (this.stopped) return;
    this.teardown();
    await this.opts.api.leave(this.opts.liveId).catch(() => {});
  }

  /**
   * Turns the guest's microphone on, once the server has let it through (it does that when they accept the invitation).
   * Throws a message fit to show them if the microphone can't be used.
   */
  async startSpeaking() {
    const participant = this.room?.localParticipant;
    if (!participant) throw new Error(t("libmsg.youreNotConnectedTo"));
    const until = Date.now() + PERMISSION_WAIT_MS;
    while (!participant.permissions?.canPublish) {
      if (Date.now() > until) throw new Error(t("libmsg.theLiveAudioService"));
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    try {
      await participant.setMicrophoneEnabled(true);
      this.speaking = true;
      this.speakingMuted = false;
    } catch (err) {
      throw new Error(micErrorMessage(err));
    }
  }

  /** Mutes or unmutes a guest's microphone (it stays theirs to control; the host can only send them back to listening). */
  async setSpeakingMuted(muted: boolean) {
    this.speakingMuted = muted;
    await this.room?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
  }

  /** Stops the guest's microphone (they've stepped down or the host has sent them back). */
  async stopSpeaking() {
    this.speaking = false;
    await this.room?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
  }

  async retry() {
    if (this.stopped) return;
    this.attempts = 0;
    await this.connect();
  }

  private teardown() {
    this.stopped = true;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    this.heartbeatPoller.stop();
    this.room?.disconnect();
    this.room = null;
    this.stream = null;
  }

  private ended() {
    if (this.stopped) return;
    this.teardown();
    this.opts.onState("ended");
  }

  private async beat() {
    try {
      const { status, listenerCount } = await this.opts.api.heartbeat(this.opts.liveId);
      this.opts.onListenerCount?.(listenerCount);
      if (status === "ended") this.ended();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) this.ended();
    }
  }

  private async connect() {
    if (this.stopped) return;
    // Forget the old room first: its own "disconnected" event must not look like a fresh failure.
    const old = this.room;
    this.room = null;
    this.stream = null; // a new room hands over its audio afresh
    old?.disconnect();
    this.attempts++;
    this.failed = false;
    this.startedAt = Date.now();
    const relay = this.useRelay;
    this.opts.onState(this.attempts > 1 ? "reconnecting" : "connecting");
    try {
      const [{ url, token }, lk] = await Promise.all([this.opts.api.token(this.opts.liveId), (this.opts.loadClient ?? loadLiveKit)()]);
      if (this.stopped) return;
      const room = new lk.Room();
      this.room = room;
      room.on(lk.RoomEvent.TrackSubscribed, (track) => {
        if (this.room !== room || track.kind !== "audio") return;
        this.attempts = 0;
        if (this.stream) {
          // a guest's voice joining the host's: the page is already playing this stream, which now carries both
          this.stream.addTrack(track.mediaStreamTrack);
        } else {
          this.stream = new MediaStream([track.mediaStreamTrack]);
          this.opts.onStream(this.stream);
        }
        this.opts.onState("live");
      });
      room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
        if (this.room === room && track.kind === "audio") this.stream?.removeTrack(track.mediaStreamTrack);
      });
      room.on(lk.RoomEvent.Reconnecting, () => {
        if (this.room !== room) return;
        this.opts.onState("reconnecting");
        // Dropping soon after starting means the direct audio route probably doesn't work on this network: rather than wait for the media
        // client to keep trying it, start over now through the relay (closing this room hands over to recover()).
        if (!this.useRelay && Date.now() - this.startedAt < HEALTHY_AFTER_MS) {
          this.useRelay = true;
          room.disconnect();
        }
      });
      room.on(lk.RoomEvent.Reconnected, () => this.room === room && this.opts.onState("live"));
      // The host leaving means the live is probably over: ask the server rather than assume (they may just be reconnecting).
      room.on(lk.RoomEvent.ParticipantDisconnected, (p) => {
        if (this.room === room && p.identity === this.opts.hostId) void this.beat();
      });
      room.on(lk.RoomEvent.Disconnected, () => {
        if (this.room === room && !this.stopped) void this.recover();
      });
      await room.connect(url, token, relay ? { rtcConfig: { iceTransportPolicy: "relay" } } : undefined);
      await this.resumeSpeaking(room);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) return this.ended();
      // anything else is most likely the network: try again through the relay before giving up
      this.useRelay = true;
      void this.recover();
    }
  }

  // A guest who was speaking when the connection was rebuilt is on a new connection with the microphone off: turn it back on, as it was.
  private async resumeSpeaking(room: LiveKit.Room) {
    if (!this.speaking || this.room !== room) return;
    const wasMuted = this.speakingMuted; // turning the microphone on again starts it unmuted
    try {
      await this.startSpeaking();
      if (wasMuted) await this.setSpeakingMuted(true);
    } catch (err) {
      this.speaking = false;
      this.opts.onSpeakingLost?.(err instanceof Error ? err.message : t("libmsg.theLiveAudioService"));
    }
  }

  private async recover() {
    if (this.stopped) return;
    // a connection that dies within moments of starting usually means the direct audio route is blocked on this network
    if (Date.now() - this.startedAt < HEALTHY_AFTER_MS) this.useRelay = true;
    if (this.attempts >= (this.opts.maxAttempts ?? 3)) {
      this.room?.disconnect();
      this.failed = true;
      this.opts.onState("failed");
      return;
    }
    await this.connect();
  }
}
