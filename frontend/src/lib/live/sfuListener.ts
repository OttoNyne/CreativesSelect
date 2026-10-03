import type * as LiveKit from "livekit-client";
import { ApiError } from "../../api/client";
import type { LiveApi } from "../../api/live.api";
import type { ListenerState } from "./listener";
import { Poller } from "./rtc";
import { micErrorMessage } from "./hostStream";

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
}

const loadLiveKit = () => import("livekit-client");

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
  private readonly heartbeatPoller: Poller;

  constructor(opts: SfuListenerOptions) {
    this.opts = opts;
    this.heartbeatPoller = new Poller(() => this.beat(), opts.heartbeatMs ?? 20_000);
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
    if (!participant) throw new Error("You're not connected to the live audio yet.");
    const until = Date.now() + PERMISSION_WAIT_MS;
    while (!participant.permissions?.canPublish) {
      if (Date.now() > until) throw new Error("The live audio service hasn't let your microphone through yet. Please try again.");
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    try {
      await participant.setMicrophoneEnabled(true);
    } catch (err) {
      throw new Error(micErrorMessage(err));
    }
  }

  /** Mutes or unmutes a guest's microphone (it stays theirs to control; the host can only send them back to listening). */
  async setSpeakingMuted(muted: boolean) {
    await this.room?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
  }

  /** Stops the guest's microphone (they've stepped down or the host has sent them back). */
  async stopSpeaking() {
    await this.room?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
  }

  async retry() {
    if (this.stopped) return;
    this.attempts = 0;
    await this.connect();
  }

  private teardown() {
    this.stopped = true;
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
      room.on(lk.RoomEvent.Reconnecting, () => this.room === room && this.opts.onState("reconnecting"));
      room.on(lk.RoomEvent.Reconnected, () => this.room === room && this.opts.onState("live"));
      // The host leaving means the live is probably over: ask the server rather than assume (they may just be reconnecting).
      room.on(lk.RoomEvent.ParticipantDisconnected, (p) => {
        if (this.room === room && p.identity === this.opts.hostId) void this.beat();
      });
      room.on(lk.RoomEvent.Disconnected, () => {
        if (this.room === room && !this.stopped) void this.recover();
      });
      await room.connect(url, token);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) return this.ended();
      void this.recover();
    }
  }

  private async recover() {
    if (this.stopped) return;
    if (this.attempts >= (this.opts.maxAttempts ?? 3)) {
      this.room?.disconnect();
      this.opts.onState("failed");
      return;
    }
    await this.connect();
  }
}
